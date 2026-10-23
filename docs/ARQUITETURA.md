# Arquitetura do Projeto — PEX Agendamento

## Visão Geral
Monorepo com backend NestJS e frontend Next.js. Backend modular por domínio, frontend com App Router.
Auditoria completa realizada em 2026-08-27 (~70 arquivos verificados).

## Backend (NestJS 11)

### Módulos
| Módulo | Arquivos | Descrição |
|---|---|---|
| **auth** | auth.controller, auth.service, jwt.strategy, login.dto, register.dto | Registro, login, perfil. Strategy carrega User + Professional. |
| **professionals** | professionals.controller, professionals.service, create-professional.dto, update-professional-profile.dto | CRUD + perfil público por slug. Inclui themeColors (JSON). |
| **appointments** | appointments.controller, appointments.service, create-appointment.dto, update-status.dto, cancel-public.dto | CRUD + rotas públicas. Business logic de conflitos, transições de status, ownership. |
| **services** | services.controller, services.service, create-service.dto, update-service.dto | CRUD ⚠️ sem guards — ver PROJETO.md RISCO C1 |
| **availabilities** | availabilities.controller, availabilities.service, 6 DTOs | CRUD completo + exceções + múltiplos períodos. Todos com guards. |
| **admin** | admin.controller, admin.module, admin.service, dto, admin-create-professional.dto, admin-update-professional.dto | RBAC (v1.2): GET /admin/me + GET /admin/professionals (listagem read-only) + POST /admin/professionals (criação Professional + User) + GET/PATCH /admin/professionals/:id (edição) com @Roles(Role.ADMIN). |
| **prisma** | prisma.module, prisma.service | PrismaService @Global() |

### Validação Global
- ValidationPipe em `main.ts` com `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`
- Port padrão: 4000 (via `process.env.PORT ?? 4000`)
- CORS: hardcoded localhost:3000/3001 — ⚠️ não funciona em produção (ver PROJETO.md A6)

### Autenticação
- JWTStrategy (@nestjs/passport) com Bearer token
- `secretOrKey: requireJwtSecret()` — ✅ resolvido (2026-09-16) — função centralizada em `jwt-validation.ts`
- ExpiresIn: 24h
- req.user: `{ userId, email, role, professionalId?, firstName, lastName }`

### Autorização por Role (RBAC — v1.1, desde 2026-10-15)
```
JWT (payload: { sub, email } — role NÃO está no JWT)
  ↓
JwtAuthGuard
  ↓
JwtStrategy consulta User no banco (a cada request autenticado)
  ↓
req.user.role
  ↓
RolesGuard (Reflector — NÃO consulta banco)
  ↓
@Roles(Role.ADMIN)
```
- Role é obtida do banco em cada request autenticado — promoção/revogação tem efeito imediato
- `@Roles` usa o enum `Role` do Prisma (`ROLES_KEY` explícita via `SetMetadata`) — `Role.ADMIN` já existia no schema, sem migration
- RolesGuard: sem metadata `@Roles` na rota/classe → permite; role divergente/ausente → 403
- Guards de role **não são globais** — route-level via `@UseGuards(JwtAuthGuard, RolesGuard)` (Jwt primeiro, Roles depois)
- Primeira rota ADMIN: `GET /admin/me` (`@Roles(Role.ADMIN)`) — ADMIN → 200 · PROFESSIONAL → 403 · sem JWT → 401
- Rotas públicas permanecem intactas; nenhum bypass ADMIN em rotas existentes
- Frontend ADMIN: existe desde f420ac0 (read-only) — ver seção "Backoffice ADMIN — frontend"

### Listagem administrativa GET /admin/professionals (desde 2026-10-16, b05169a)
```
ADMIN
  ↓
GET /admin/professionals
  ↓
AdminService
  ↓
Prisma findMany + count
  ↓
{ items, total, limit, offset }
```
- **Read-only** — sem criação/edição/suspensão/exclusão nesta rota
- Proteção: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` — PROFESSIONAL → 403 · sem JWT → 401 · ADMIN → 200
- Paginação server-side: limit default 20 / máx 100, offset default 0 (DTO com class-validator; inválido → 400)
- `search` opcional: `contains` case-insensitive em `name` OR `slug` OR `user.email`
- `select` explícito sem password; `user` pode ser null (Professional sem User é válido); `_count` de services/appointments
- Ordenação determinística: `createdAt desc` + `id asc`; `total` vem de `count` com o mesmo `where`
- Rota pública `GET /professionals` permanece separada e inalterada; nenhum bypass ADMIN nas rotas antigas

### Criação administrativa POST /admin/professionals (backend desde 2026-10-18, cfc4ad2; frontend d7c81d8)
```
ADMIN
  ↓
/admin/professionals/new (route group (protected) → AdminRoute)
  ↓
react-hook-form → api.post('/admin/professionals') (mesmo cliente Axios)
  ↓
AdminService.createProfessional
  ↓
bcrypt hash (custo 10, antes da escrita)
  ↓
Prisma Professional.create └── user.create aninhado
  ↓
Professional + User (role PROFESSIONAL)
```
- **Contrato**: `name`, `slug`, `email`, `firstName`, `lastName`, `password` — todos obrigatórios; `slug` validado com `^[a-z0-9-]+$`, `email` com `@IsEmail`, `password` com `@MinLength(8)`; campos extras → 400 via `forbidNonWhitelisted`
- **Role**: sempre `PROFESSIONAL`, definida internamente — o cliente não controla role/ids/timestamps
- **Atomicidade**: uma única nested write Prisma (`professional.create` com `user.create`); os testes validam a operação única estruturalmente — não afirmam rollback real do PostgreSQL
- **Conflitos**: `P2002` → 409 com mensagens seguras (email → "E-mail já cadastrado." · slug → "Slug já cadastrado." · target desconhecido → 409 genérico); sem expor meta/constraint/stack
- **Resposta 201**: `{ professional: { id, slug, name, createdAt }, user: { id, email, firstName, lastName, role, professionalId, createdAt } }` — sem password
- **Proteção**: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` — PROFESSIONAL → 403 · sem JWT → 401
- **Dívida não bloqueante (existente)**: `name`/`firstName`/`lastName` seguem o padrão atual de `@IsNotEmpty` — whitespace-only passa; não corrigido nesta entrega
- **Frontend**: formulário em `/admin/professionals/new` (d7c81d8) — sem guard/auth/cliente HTTP paralelos; `RolesGuard` continua sendo a boundary real de autorização
- **Safe smoke em produção (backend, 2026-10-18)**: POST sem JWT → 401 · POST como PROFESSIONAL → 403 · ADMIN + DTO inválido → 400 (role extra rejeitada) · GETs ADMIN → 200 · nenhuma criação inesperada. Primeiro 201 real ainda não executado em produção
- **Sem mudança**: schema Prisma (nenhuma migration), auth público, professionals.service, rotas públicas

### Edição administrativa GET/PATCH /admin/professionals/:id (backend desde 2026-10-20, 98f9a46)
```
ADMIN
  ↓
GET /admin/professionals/:id
  ↓
AdminService.getProfessional
  ↓
Prisma findUnique (select explícito)
  ↓
{ professional, user | null } — sem password
```
```
ADMIN
  ↓
PATCH /admin/professionals/:id
  ↓
precheck findUnique (Professional/User)
  ↓
professional.update
  └── user.update aninhado
```
- **Proteção**: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` em ambas — PROFESSIONAL → 403 · sem JWT → 401 · ADMIN → permitido. Não são rotas públicas
- **GET**: response `{ professional: { id, name, slug, createdAt, updatedAt }, user: { id, email, firstName, lastName, role, createdAt, updatedAt } | null }` — select explícito, password nunca retorna; inexistente → 404 "Profissional não encontrado."; Professional sem User → 200 com `user: null` (a tela futura trata)
- **PATCH**: completo (não parcial) — exatamente 5 campos obrigatórios (`name`, `slug`, `email`, `firstName`, `lastName`); `role`/`password`/`professionalId`/`userId`/`id`/timestamps no body → 400 via `forbidNonWhitelisted`; password e role não são alterados por esta rota
- **Precheck**: Professional inexistente → 404; Professional existe + `user=null` → 409 "Este profissional não possui usuário associado." — nenhuma escrita antes dessas verificações (não cria User silenciosamente, não atualiza só o Professional)
- **Atomicidade**: uma única nested write Prisma (`professional.update` com `user.update` aninhado); os testes validam essa composição estruturalmente — não afirmam rollback real do PostgreSQL
- **Conflitos**: `P2002` → 409 com mensagens seguras (email → "E-mail já cadastrado." · slug → "Slug já cadastrado." · target desconhecido → 409 genérico) — a constraint unique é a autoridade, sem precheck de email/slug; `P2025` residual pós-precheck (concorrência/inconsistência — causa não distinguível de forma robusta, sem parsing de message) → 409 genérico "O cadastro foi alterado durante a operação. Recarregue e tente novamente."; outros erros seguem o tratamento normal
- **Slug**: o ADMIN pode alterar o slug — backend sem normalização, apenas valida `^[a-z0-9-]+$`; alterar o slug muda a URL pública do profissional (sem redirect automático do slug antigo — dívida operacional, não bug bloqueante)
- **Email**: o ADMIN pode alterar o email do User associado — isso altera a credencial de login do profissional; sem confirmação por email nesta versão
- **Testes**: `admin-edit-professional.spec.ts` (36 cenários — cadeia real de guards + ValidationPipe real, Prisma mockado, sem banco real); admin 82/82 (4 suítes); suíte completa 164/164 (15 suítes); `npm run build` PASS

### Ownership por Módulo
| Módulo | Ownership | Observação |
|---|---|---|
| appointments | ✅ | Sempre `req.user?.professionalId` em rotas protegidas |
| availabilities | ✅ | Sempre `req.user?.professionalId` em rotas protegidas |
| professionals/me | ✅ | `req.user?.professionalId` |
| professionals/:id | ✅ | Ownership via `req.user?.professionalId` — cross-tenant → 404, sem professionalId → 403 (SEC-001, cd0cd21) |
| services | ❌ | Sem guards — 100% público |
| GET /professionals | — | Rota pública — payload limitado a dados do Professional (sem User) |

## Frontend (Next.js 16.3.1)

### Rotas
| Rota | Auth | Descrição |
|---|---:|---|
| `/` | ❌ | Landing page |
| `/login` | ❌ | Login |
| `/agendamentos` | ❌ | Consulta pública de agendamentos por telefone |
| `/professional/[slug]` | ❌ | Página pública do profissional |
| `/dashboard` | ✅ | Agendamentos do profissional (ativos/finalizados) |
| `/dashboard/services` | ✅ | CRUD de serviços ⚠️ busca global não filtrada |
| `/dashboard/availability` | ✅ | Gestão de disponibilidade + exceções |
| `/dashboard/profile` | ✅ | Perfil + theme colors |
| `/admin/login` | ❌ | Login do backoffice (somente ADMIN conclui o acesso) |
| `/admin` | ADMIN | Painel administrativo read-only |
| `/admin/professionals` | ADMIN | Listagem read-only de profissionais + botão "Novo profissional" |
| `/admin/professionals/new` | ADMIN | Formulário de criação de profissional (d7c81d8) |
| `/admin/professionals/[id]/edit` | ADMIN | Formulário de edição de profissional (714037a) |

### Autenticação
- `useAuth()` hook com localStorage para JWT
- Axios interceptors para Bearer token e redirect 401
- ProtectedRoute wrapper no dashboard layout
- ⚠️ localStorage vulnerável a XSS — ver PROJETO.md A2

### Backoffice ADMIN — frontend (read-only desde 2026-10-16, f420ac0; criação desde 2026-10-18, d7c81d8; edição desde 2026-10-22, 714037a)
- Route groups do App Router: `app/admin/(auth)` (login, SEM guard) e `app/admin/(protected)` (layout com `AdminRoute`) — route groups não aparecem na URL
- Reutiliza o mesmo `useAuth()`, o mesmo cliente Axios e o mesmo `POST /auth/login` — sem segundo AuthContext e sem segundo cliente HTTP
- `/admin/login`: ADMIN → `/admin`; não-ADMIN → sessão removida imediatamente, acesso recusado, permanece na página
- Área protegida: sem sessão → `/admin/login`; PROFESSIONAL → `/login`; ADMIN → acesso
- `AdminRoute` (frontend) = guard de UX; o backend (`RolesGuard` + `@Roles(Role.ADMIN)`) continua sendo a boundary real de autorização
- Interceptor 401: em `/admin/*` → remove token e redireciona para `/admin/login`; **exceção**: já estando em `/admin/login`, remove o token mas NÃO redireciona/recarrega (permite exibir erro de credenciais do próprio login); fora da área ADMIN → `/login` (inalterado)
- Logout: ADMIN → `/admin/login`; profissional → `/login` (inalterado)
- `/admin/professionals`: tabela read-only, search com debounce 400 ms (trim, parâmetro omitido quando vazio, mudança de termo reseta offset), paginação Anterior/Próxima (limit 20), skeleton/empty state/erro com retry, `user=null` seguro, resposta obsoleta descartada (guarda de sequência), botão "Novo profissional" → `/admin/professionals/new`
- `/admin/professionals/new` (d7c81d8): formulário react-hook-form com os 6 campos do contrato (`name`, `slug`, `email`, `firstName`, `lastName`, `password`); slug sugerido a partir do nome enquanto nunca editado manualmente (conveniência de UX — o backend **não** normaliza, apenas valida o formato); após edição manual o nome não sobrescreve o slug; payload exatamente os 6 campos (sem role/ids/timestamps — backend força PROFESSIONAL); senha inicial manual (≥ 8 no frontend; backend autoridade), enviada no POST e não persistida/exibida pelo frontend; 201 → toast + volta à listagem; 400 legível; 409 mapeado ao campo (email/slug) ou geral; 403 sem logout; 5xx/rede com retry; duplo submit bloqueado
- `/admin/professionals/[id]/edit` (714037a): Client Component dentro do grupo `(protected)` (herda o `AdminRoute` — sem guard novo, sem layout novo, sem cliente HTTP novo); `params: Promise<{ id }>` (padrão Next.js 16 do projeto). GET inicial `GET /admin/professionals/:id` preenche o formulário (react-hook-form) com exatamente 5 campos (`name`, `slug`, `email`, `firstName`, `lastName` — password/role/ids/timestamps não são renderizados nem enviados). Loading com skeleton (nunca formulário vazio fingindo dado); resposta obsoleta do GET descartada por guarda de sequência (seqRef — coberta por teste). Slug carregado exatamente como está, sem sugestão automática (mudar o nome não altera o slug) + aviso "Alterar o slug muda a URL pública do profissional."; email editável + aviso "Alterar o e-mail muda a credencial usada pelo profissional para entrar."; validações de UX idênticas ao DTO (obrigatórios, email formato, slug `^[a-z0-9-]+$`) — backend autoridade.
- user=null: aviso "Este profissional não possui usuário associado.", Salvar desabilitado, nenhum PATCH possível, nenhum valor fictício, nenhum User criado automaticamente (backend manteria 409 se tentado).
- PATCH: payload objeto explícito com exatamente os 5 campos (sem spread); duplo submit bloqueado (`isSubmitting`, botão "Salvando..." — teste com Promise pendente prova 1 única chamada). Erros: GET 404 → estado dedicado; PATCH 404 → permanece na tela com formulário preenchido; 409 email/slug mapeados por mensagem exata para o campo; 409 user ausente e 409 residual → erro geral; 409 desconhecido → fallback seguro; 403 sem logout; 5xx/rede → mensagem genérica + retry; 401 → interceptor existente. Redirect + toast apenas no 200. Tipos adicionados em `types/index.ts`: `AdminProfessionalDetails`, `AdminUpdateProfessionalPayload`, `AdminUpdateProfessionalResponse`.
- Dívida não bloqueante: `AdminRoute` e o shell do layout usam instâncias independentes de `useAuth()` → dois `GET /auth/profile` por navegação na área protegida (sem impacto de segurança; não corrigido nesta entrega)
- Testes frontend: Vitest + Testing Library (jsdom), 7 suítes, 67/67 passando, sem backend real (mocks)

## Banco de Dados (PostgreSQL + Prisma 6)

### Schema — 8 Models, 3 Enums
Ver AGENTS.md → seção "Prisma — Models Confirmados" para tabela completa.

### Relacionamentos Principais
```
User 1→0..1 Professional 1→N Service[]
                   ├─ Appointment[]
                   ├─ Availability[] → AvailabilityPeriod[]
                   └─ AvailabilityException[]
Service N→1 Professional → Appointment[]
Customer 1→N Appointment[]
```

### Regras de Negócio Implementadas
Ver AGENTS.md → seção "Regras de Negócio" para lista completa.
Resumo: múltiplos períodos, validação de conflitos, transições de status controladas,
exclusão apenas de finalizados, cancelamento público com validação de telefone.

## Fluxos Principais

### 1. Login Profissional
```
/frontend/login → POST /auth/login → { accessToken, user }
→ localStorage.setItem('token', ...)
→ /dashboard → GET /auth/profile (via useAuth) → user carregado
```

### 2. Agendamento Público
```
/professional/[slug] → GET /professionals/slug/:slug → dados do profissional
→ GET /appointments/available?date&professionalId&serviceId → horários livres
→ POST /appointments → agendamento criado com status PENDING
```

### 3. Gestão de Agendamentos
```
/dashboard → GET /appointments → lista filtrada por professionalId do JWT
→ PATCH /appointments/:id/status → confirma/cancela (transições validadas)
→ DELETE /appointments/:id → remove se status finalizado
→ DELETE /appointments/cleanup → remove todos finalizados
```

### 4. Consulta Pública de Agendamentos
```
/agendamentos → CustomerAppointments → GET /appointments/by-phone?phone=
→ retorna appointments com customer, service, professional includes
→ PATCH /appointments/:id/cancel-public → cancela se phone válido + status PENDING/CONFIRMED
```

### 5. Backoffice ADMIN — read-only (desde 2026-10-16, f420ac0)
```
/admin/login
    ↓
POST /auth/login
    ↓
ADMIN
    ↓
/admin
    ↓
AdminRoute (guard de UX)
    ↓
/admin/professionals
    ↓
GET /admin/professionals
```
- Guard frontend = UX; backend (`RolesGuard`) = boundary real de autorização
- Não-ADMIN em `/admin/login`: sessão removida, acesso recusado, permanece na página
- Criação já existe ponta a ponta: backend (`POST /admin/professionals`, cfc4ad2) + formulário `/admin/professionals/new` (d7c81d8 — ver seção "Criação administrativa")
- Edição já existe ponta a ponta: backend (`GET`/`PATCH /admin/professionals/:id`, 98f9a46) + formulário `/admin/professionals/[id]/edit` com ação "Editar" na listagem (714037a — ver seção "Backoffice ADMIN — frontend"); suspensão/reativação/exclusão pendentes

## Pontos de Atenção
Ver PROJETO.md → "Lista Priorizada de Problemas" para detalhes.
Ver AGENTS.md → "Pendências de Confirmação" e "Melhorias Planejadas".