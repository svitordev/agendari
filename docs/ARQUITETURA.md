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
| **admin** | admin.controller, admin.module, admin.service, dto, admin-create-professional.dto, admin-update-professional.dto, admin-update-professional-status.dto | RBAC (v1.2): GET /admin/me + GET /admin/professionals (listagem read-only) + POST /admin/professionals (criação Professional + User) + GET/PATCH /admin/professionals/:id (edição) + PATCH /admin/professionals/:id/status (suspensão/reativação) + DELETE /admin/professionals/:id (arquivamento lógico — soft delete) com @Roles(Role.ADMIN). |
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
- Suspensão (78bd46e): `Role.PROFESSIONAL` + `Professional.status = SUSPENDED` → 403 em qualquer request autenticada — inclusive JWT emitido antes da suspensão (sem blacklist — o enforcement vem da consulta ao banco) — ver seção "Status operacional"
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

### Status operacional PATCH /admin/professionals/:id/status (backend desde 2026-10-23, 78bd46e — migration aplicada em produção em 2026-10-25; frontend desde 2026-10-25, ee3a6e2)
```
ADMIN
  ↓
PATCH /admin/professionals/:id/status
  ↓
precheck findUnique (inexistente → 404)
  ↓
status atual == pedido → 200 SEM write (idempotente)
  ↓
diferente → update SOMENTE de Professional.status
```
- **Modelo**: `enum ProfessionalStatus { ACTIVE SUSPENDED }`; `Professional.status @default(ACTIVE)` — fonte única de verdade operacional; **não** existe status equivalente em User; sem `suspendedAt`/`reactivatedAt`/`statusChangedAt`/`suspensionReason`/`isActive` no Professional (auditoria completa ainda não existe)
- **Migration**: `20261023000000_add_professional_status` — aditiva (`CREATE TYPE` + `ADD COLUMN NOT NULL DEFAULT 'ACTIVE'`); registros existentes recebem ACTIVE; não destrutiva; não altera User; **aplicada em produção em 2026-10-25** (histórico Prisma íntegro confirmado antes da execução; backend publicado e validado por safe smoke)
- **DTO separado**: `AdminUpdateProfessionalStatusDto` — único campo `status` (`@IsEnum` do enum gerado); o PATCH de edição (5 campos) continua sem aceitar `status` (→ 400 via `forbidNonWhitelisted`); sem mass assignment
- **Proteção**: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` — PROFESSIONAL → 403 · sem JWT → 401
- **Idempotência real**: ACTIVE→ACTIVE e SUSPENDED→SUSPENDED retornam 200 **sem chamar update** (updatedAt não é alterado artificialmente; duplo acionamento seguro); mudança real altera somente `Professional.status`
- **user=null**: Professional sem User pode ser suspenso/reativado normalmente — nenhuma criação automática de User; a suspensão pertence ao tenant (Professional), não ao login
- **Responses admin**: listagem e GET individual agora incluem `status` no select seguro; criação/edição retornam `status` (novo Professional nasce ACTIVE pelo default do banco — o service não envia status controlável); password continua ausente; GET individual: `{ professional: { id, name, slug, status, createdAt, updatedAt }, user: { id, email, firstName, lastName, role, createdAt, updatedAt } | null }`
- **Auth enforcement (JwtStrategy)**: a consulta User+Professional já roda em cada request autenticada; `Role.PROFESSIONAL` + `professional.status === SUSPENDED` → **403** "Conta suspensa. Entre em contato com o administrador." — JWT emitido ANTES da suspensão é bloqueado na próxima request; ADMIN nunca é bloqueado; reativado → acesso volta (nenhum token novo é necessário — sem blacklist)
- **Login**: `POST /auth/login` valida a senha ANTES de revelar suspensão (senha correta + suspenso → 403 com a mensagem; senha errada → 401 "Credenciais inválidas." — o login não vira enumeração do estado da conta); ADMIN loga normalmente
- **Booking público**: `POST /appointments` para suspenso → **403** "Este profissional não está aceitando novos agendamentos no momento." — zero Appointment criado; backend é a autoridade (frontend futuro não pode ser a única proteção)
- **Available**: `GET /appointments/available` para suspenso → `{ available: false, slots: [], message }` (mesmo shape já usado pelo endpoint); Availability não é modificada
- **Appointments existentes**: suspensão NÃO cancela, NÃO apaga, NÃO altera histórico; Services/Availability preservados; `by-phone` e `cancel-public` continuam funcionando (fluxos do cliente — deliberado para não punir clientes com appointment existente)
- **Perfil público**: Professional SUSPENDED continua publicamente consultável — `GET /professionals` e `GET /professionals/slug/:slug` agora expõem `status` (campo do model); perfil não vira 404 por suspensão; UI futura informará indisponibilidade para novos bookings
- **Frontend**: badge Ativo/Suspenso + ações Suspender (com AlertDialog de confirmação)/Reativar (direta) implementados na listagem ADMIN (ee3a6e2 — já pushado); UX de login/sessão para suspenso e aviso na página pública implementados (e8a1a2d — já pushado) — ver seção "UX frontend de Professional suspenso"
- **Testes**: `admin-professional-status.spec.ts` (23) + `auth-suspension.spec.ts` (11) + `appointments-suspension.spec.ts` (13 — inclui perfil público); suíte completa backend **211/211** (18 suítes); `npm run build` PASS; `prisma validate`/`generate` PASS

### Arquivamento lógico de Professional — soft delete (backend desde 2026-10-26, b2f6377 — migration aplicada em produção em 2026-10-26 + safe smoke PASS; frontend 1e3c913 — pushado, deployado no Vercel e validado em produção em 2026-10-28)
```
ADMIN
  ↓
DELETE /admin/professionals/:id (sem body, sem DTO)
  ↓
precheck findUnique (inexistente → 404; já arquivado → 204 SEM escrita)
  ↓
update condicional `where { id, deletedAt: null }` escrevendo SOMENTE `deletedAt`
  ↓
P2025 → re-check: arquivado → 204 · inexistente → 404
```
- **Decisão arquitetural**: NÃO existe hard delete de Professional — a remoção operacional é soft delete via `Professional.deletedAt DateTime?` (lifecycle: null = operacional, != null = arquivado). `ProfessionalStatus` permanece ACTIVE/SUSPENDED (estado operacional) — sem `ARCHIVED` no enum; sem `deletedBy`/`deletionReason`/`isDeleted`
- **Motivo do soft delete**: o hard delete atual não é seguro — Appointment→Professional é Restrict e AvailabilityException→Professional não tem onDelete (Restrict), e as demais relações geram cascade de User/Services/Availability; archive preserva os dados e evita perda histórica
- **Migration**: `20261026000000_add_professional_deleted_at` — aditiva (`ADD COLUMN "deletedAt" TIMESTAMP(3)` nullable, sem default); registros existentes permanecem `deletedAt = null`; sem UPDATE/DELETE/DROP; nenhuma FK alterada; não destrutiva; **aplicada em produção (2026-10-26)** — backend correspondente publicado e validado por safe smoke
- **Resposta/idempotência**: sucesso → **204** sem body · inexistente → **404** "Profissional não encontrado." · já arquivado → **204 sem escrita** (deletedAt anterior preservado); DELETE repetido é idempotente; Professional com `user=null` pode ser arquivado normalmente (nenhum User é criado)
- **Dados preservados**: archive NÃO deleta User, NÃO cancela Appointment, NÃO apaga Appointment, NÃO deleta Service/Availability/Period/Exception — nenhum agendamento é cancelado automaticamente (futuros e históricos permanecem intactos)
- **ADMIN**: listagem (findMany + count) e search filtram `deletedAt: null` (archived não escapa pelo OR do search); paginação preservada; GET individual, edição (PATCH) e status de arquivado → **404**; mudança de status NÃO restaura archived (restore é feature futura separada); status no-op para não-arquivado continua sem escrita; create não aceita `deletedAt` controlável (novo Professional nasce `deletedAt = null` pela semântica nullable do schema/banco)
- **Race safety**: edição e status escrevem com condição `deletedAt: null` no update — se um archive entrar entre o pre-check e a escrita, o update não casa (P2025 → 409); nenhum update posterior altera arquivado; P2025 do archive passa por re-check antes da resposta (não declara 204 cegamente)
- **Auth (login)**: a senha é validada ANTES de revelar o arquivamento (senha errada em User arquivado → 401 genérico — sem enumeração de estado); senha correta + arquivado → **403** "Este perfil foi desativado. Entre em contato com o administrador."; **archive tem prioridade sobre SUSPENDED** (arquivado+SUSPENDED → mensagem de arquivamento, não de suspensão); ADMIN nunca é bloqueado
- **JWT antigo**: a JwtStrategy (que já consulta o banco em cada request) bloqueia Professional arquivado — JWT emitido antes do archive cai na próxima request privada (403); ADMIN não é afetado
- **Público**: `GET /professionals` não retorna arquivado; `GET /professionals/slug/:slug` de arquivado → **404** (página sai do ar; slug permanece reservado — linha existe, unique vale, sem 410/tombstone nesta versão; email continua reservado — sem reutilização automática); services públicos de arquivado → `[]`; availability pública de arquivado → `[]`; booking `POST /appointments` de arquivado → **403** "Este profissional não está disponível para novos agendamentos." com zero Appointment criado; `GET /appointments/available` de arquivado → `{ available: false, slots: [], message }` (shape existente preservado)
- **Appointments existentes**: `by-phone` e `cancel-public` intactos — cliente de profissional arquivada continua consultando e cancelando appointment já existente (histórico preservado)
- **Leak `deletedAt` (corrigido no quality review)**: `findAll`/`findOneById`/`findOneBySlug` retornavam o model Prisma completo e passariam a expor `deletedAt` nas responses públicas — o campo é removido antes da response (guard interno); testes dedicados garantem a ausência da propriedade
- **Testes**: `admin-archive-professional.spec.ts` (22) + `auth-archived.spec.ts` (12) + `appointments-archived.spec.ts` (15); backend total **260/260** (21 suítes); `npm run build` PASS; `prisma validate`/`generate` PASS
- **Frontend**: implementado, publicado e validado em produção (1e3c913 — pushado, deployado no Vercel, safe smoke PASS em 2026-10-28) — ver seção "UX frontend de Professional arquivado"

### Status de Appointment — hardening da state machine pelo Professional (backend desde 2026-10-29, commit 45526f9 — pushado, deployado e validado por safe smoke em produção em 2026-10-30)
```
PATCH /appointments/:id/status (JwtAuthGuard)
  ↓
professionalId SOMENTE da sessão (DTO não controla tenant)
  ↓
pre-check findFirst { id, professionalId } → 404 cross-tenant
  ↓
state machine + timing → 400
  ↓
CAS: updateMany where { id, professionalId, status lido }
  ├── count=1 → leitura final (autoridade da response)
  └── count=0 → re-check { id, professionalId }
        ├── não existe → 404
        └── estado mudou (corrida) → 409
```
- **Contexto**: a state machine já existia — este hardening não criou o domínio do zero; endureceu transições, timing, tenant, concorrência, response authority e testes. O frontend ainda usa a UI anterior neste momento
- **Matriz (preservada)**: PENDING → CONFIRMED/CANCELLED; CONFIRMED → COMPLETED/CANCELLED/NO_SHOW; CANCELLED/COMPLETED/NO_SHOW terminais; mesmo estado (ex.: CONFIRMED→CONFIRMED, CANCELLED→CANCELLED) → 400 "Esta alteração de status não é permitida." com zero write — não é tratada como idempotência
- **Timing**: COMPLETED/NO_SHOW somente quando `date <= now` (campo temporal real do Appointment); antes disso → 400 "O horário agendado ainda não ocorreu."; CANCELLED somente antes do horário — depois → 400 com a mesma mensagem do cancel-public ("Não é possível cancelar um agendamento que já iniciou."); comparação Date com Date (instantes UTC), sem timezone manual ou offset hardcoded
- **Boundary**: `date === now` conta como horário já ocorrido → COMPLETED/NO_SHOW permitidos, CANCELLED bloqueado; teste com relógio fixo (`setSystemTime`), sem depender de milissegundos reais
- **PENDING passado (decisão deliberada)**: permanece PENDING e ainda pode ser CONFIRMADO (confirmar não tem gate de timing); só depois, como CONFIRMED passado, aceita COMPLETED ou NO_SHOW; PENDING direto → COMPLETED/NO_SHOW → 400; PENDING passado → CANCELLED → 400; auto-expiração continua dívida futura
- **CONFIRMED futuro**: CANCELLED permitido; COMPLETED/NO_SHOW bloqueados (400). **CONFIRMED passado**: COMPLETED/NO_SHOW permitidos; CANCELLED bloqueado (400)
- **Cancellation metadata**: cancelamento Professional escreve status + cancelledBy=PROFESSIONAL + cancellationReason + cancelledAt na MESMA write CAS — nunca status primeiro e metadata depois; corrida não deixa metadata parcial; reason obrigatório no fluxo Professional (vazio/só espaços → 400); demais status não tocam a metadata de cancelamento
- **Tenant boundary**: professionalId vem da sessão/JWT, nunca do body; Professional A tentando alterar Appointment de B → 404 (sem existence leak); usuário autenticado sem Professional → 400 "Profissional não identificado." (ADMIN não ganhou capacidade especial)
- **CAS (anti lost-update)**: `updateMany` com os três filtros `id` + `professionalId` + status anterior lido do banco; count=1 → write venceu, nenhuma nova write; count=0 → re-check seguro por id+professionalId: não existe → 404; existe com estado diferente → 409 "O agendamento foi alterado por outra operação. Atualize e tente novamente."; contagem exata de mutações respeitada (nenhuma segunda write em corrida)
- **Response authority**: após CAS vencido, a response vem da leitura final do banco — nunca o objeto stale pré-escrita; o frontend deve tratar a response final do backend como autoridade (sem optimistic status por intenção) — relevante para a próxima fase frontend
- **Final-read 404 (quality review)**: a leitura final pós-CAS podia resultar em null se o Appointment fosse removido fisicamente por outro fluxo entre a write e a leitura (possível via `remove`/`cleanup` em finalizados); corrigido: null → 404 "Agendamento não encontrado.", nunca 200 com corpo null
- **Contrato preservado**: `PATCH /appointments/:id/status` e `UpdateAppointmentStatusDto` (enum + reason opcional) inalterados; nenhum endpoint novo (/confirm, /cancel, /complete, /no-show); response shape idêntico ao anterior; `cancel-public` não foi reescrito (regras e metadata CUSTOMER intactas)
- **Erros**: transição inválida/timing → 400; não encontrado/cross-tenant → 404; corrida stale → 409 — sem misturar
- **Testes**: `appointments-status-transition.spec.ts` **38/38** (auth 401 real via cadeia Controller/Guard, tenant, matriz completa, timing, boundary com relógio fixo, mesma-escrita, CAS/re-check, 404/409, no-partial, response-final, final-read disappearance, reason whitespace); backend total **298/298** (22 suítes); `npm run build` PASS; `prisma validate` PASS; frontend à época 159/159 (9 suítes) — hoje 221/221 (10 suítes), ver seção de UX frontend

### UX frontend do gerenciamento de agendamentos do Professional (58787cb — commit local, ainda NÃO pushado)
- **Escopo**: exatamente 2 arquivos — `frontend/app/dashboard/page.tsx` (reescrito; dashboard existente reutilizado, nenhuma página nova) + suíte nova `tests/dashboard-appointments.test.tsx` (62 testes); backend/Prisma/migration/package files intocados; nenhuma dependency npm nova; CustomerAppointments/by-phone/cancel-public/ADMIN intactos
- **Sheet → AlertDialog**: o Sheet anterior era usado SOMENTE no fluxo de cancelamento; substituído por AlertDialog controlado; nenhuma informação ou funcionalidade adicional perdida
- **Tabs**: **Próximos** (tab inicial) = PENDING/CONFIRMED futuros, do mais próximo primeiro; **Histórico** = CANCELLED/COMPLETED/NO_SHOW + PENDING/CONFIRMED passados, do mais recente para o mais antigo; sem auto-switch — a tab permanece previsível com empty state próprio
- **PENDING/CONFIRMED passados**: PENDING passado fica no Histórico mas ainda oferece Confirmar; após confirmar, permanece no Histórico como CONFIRMED passado e passa a oferecer Concluir/Não compareceu; CONFIRMED passado oferece Concluir + Não compareceu; terminais não oferecem ação de status (só Excluir, regra pré-existente de finalizados)
- **Timing visual**: `date <= now` (mesma semântica do backend — boundary equality = já ocorreu) decide apenas QUAIS controles exibir; o backend permanece a autoridade de domínio/segurança e valida cada transição
- **Filtro de status**: Todos/Pendente/Confirmado/Cancelado/Concluído/Não compareceu — atua somente dentro da tab atual; enum técnico nunca exibido ao usuário (labels PT-BR); empty states: "Nenhum próximo agendamento." / "Nenhum agendamento no histórico." / "Nenhum agendamento para este filtro."
- **Ações**: Confirmar (PENDING→CONFIRMED) é direta — `PATCH /appointments/:id/status` com body exato `{ status: "CONFIRMED" }` sem reason; Concluir/Não compareceu/Excluir/Limpar usam AlertDialog (Excluir/Limpar destructive); cancelamento usa AlertDialog com motivo obrigatório (trim, maxLength 500, whitespace-only inválido, confirmação desabilitada sem motivo válido) — `PATCH` com `status: "CANCELLED"` + reason trimado
- **Isolamento do motivo**: o motivo não vaza entre appointments — fechar A e abrir B inicia vazio; sucesso limpa; Voltar limpa; erro preserva o contexto para retry
- **Zero native dialogs**: window.confirm/window.alert/prompt() não são usados na área de appointments
- **Loading/double submit**: loading granular por appointment id (ação em A não bloqueia B); cleanup é ação global com loading próprio; guard síncrono `useRef<Set<string>>` (chave = id ou cleanup) — dois cliques rápidos produzem 1 request; guard liberado em 200/400/403/404/409/5xx/rede — retry sempre possível
- **Response authority**: após PATCH sucesso o item é substituído pelo `response.data` do backend — zero optimistic status; se o backend responder diferente da intenção, a UI respeita a response; tabs/filtro/ordenação/empty state são derivados do estado atualizado e recalculados após a response sem refetch obrigatório
- **Reclassificação pós-response**: PENDING futuro → CONFIRMED permanece Próximos; CONFIRMED futuro → CANCELLED sai de Próximos e entra no Histórico; PENDING passado → CONFIRMED permanece no Histórico com Concluir/Não compareceu; CONFIRMED passado → COMPLETED/NO_SHOW permanece no Histórico sem ações de status
- **Erros**: 400 reflete SOMENTE mensagens allowlisted do contrato (transição inválida, horário ainda não ocorreu, cancelamento após horário, motivo obrigatório, não encontrado, concorrência) — mensagem desconhecida → fallback seguro; 404 → feedback seguro + refetch `GET /appointments` (remove stale state); 409 → mensagem de concorrência + refetch (sem fingir sucesso); 401 → interceptor existente (não duplicado); 403 comum → feedback seguro sem logout local (suspended/archived continuam no interceptor); 5xx/rede → item e status permanecem, loading e guard liberam, retry possível, zero feedback de sucesso; botão Atualizar faz somente GET (zero write)
- **Stats**: cards de resumo derivados da coleção completa de appointments — não dependem da tab/filtro ativa
- **Mobile**: cards preservados; tabs com wrap; filtro responsivo; ações com wrap; AlertDialogs responsivos; sem tabela horizontal nova
- **Quality review**: zero defeitos de production code; 1 LOW no próprio teste + 6 gaps LOW de cobertura reforçados (anti-optimistic com response divergente, isolamento do motivo, retry pós-erro, PENDING passado pós-confirmar, filtro/empty state pós-transição, DELETE erro não remove); production code não precisou de correção no review
- **Testes**: `dashboard-appointments` **62/62**; api-interceptor **25/25**; ambos juntos **87/87** nas duas ordens (independência verificada); frontend total **221/221** (10 suítes); `npm run build` PASS; backend permanece **298/298** (22 suítes)
- **Estado**: commit local `58787cb` — ainda NÃO pushado; Vercel ainda NÃO validado; production smoke deste frontend ainda NÃO executado

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
| `/login` | ❌ | Login (exibe aviso quando `?reason=suspended` — e8a1a2d — ou `?reason=archived` — 1e3c913) |
| `/agendamentos` | ❌ | Consulta pública de agendamentos por telefone |
| `/professional/[slug]` | ❌ | Página pública do profissional (aviso de indisponibilidade para suspensos — e8a1a2d) |
| `/dashboard` | ✅ | Agendamentos do profissional — tabs Próximos/Histórico + filtro de status + AlertDialogs (58787cb) |
| `/dashboard/services` | ✅ | CRUD de serviços ⚠️ busca global não filtrada |
| `/dashboard/availability` | ✅ | Gestão de disponibilidade + exceções |
| `/dashboard/profile` | ✅ | Perfil + theme colors |
| `/admin/login` | ❌ | Login do backoffice (somente ADMIN conclui o acesso) |
| `/admin` | ADMIN | Painel administrativo read-only |
| `/admin/professionals` | ADMIN | Listagem de profissionais + botão "Novo profissional" + coluna Status (badge) + ações Suspender/Reativar (ee3a6e2) — sem botão archive (decisão de UX: ação somente na edição) |
| `/admin/professionals/new` | ADMIN | Formulário de criação de profissional (d7c81d8) |
| `/admin/professionals/[id]/edit` | ADMIN | Formulário de edição de profissional (714037a) + zona de perigo com ação "Arquivar profissional" via AlertDialog (1e3c913) |

### Autenticação
- `useAuth()` hook com localStorage para JWT
- Axios interceptors para Bearer token e redirect 401
- Interceptor de 403 de **conta suspensa** (e8a1a2d): somente `403` + mensagem exata "Conta suspensa. Entre em contato com o administrador." em request privada → remove token + redirect `/login?reason=suspended`; `POST /auth/login` está excluído (a página trata inline); 403 comum NÃO faz logout; ver seção "UX frontend de Professional suspenso"
- ✅ `ARCHIVED_SESSION_FRONTEND_UX_PENDING=false` (1e3c913): o interceptor reconhece as DUAS mensagens exatas (suspensão e arquivamento) com flag de redirect compartilhada; ver seção "UX frontend de Professional arquivado"
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
- `/admin/professionals` — coluna Status + ações (ee3a6e2): badge com texto "Ativo"/"Suspenso" (o enum técnico nunca é exibido como label; cor é apenas reforço — `secondary`/`destructive`); ações por linha: ACTIVE → Editar + Suspender, SUSPENDED → Editar + Reativar (nunca as duas de status simultaneamente); Suspender abre AlertDialog de confirmação (título "Suspender este profissional?" + descrição: perde acesso às áreas privadas, novos agendamentos bloqueados, dados e agendamentos existentes preservados, ação reversível; Cancelar fecha com zero PATCH); Reativar é direta (reversível, restaura acesso); payload literal `{ status }` — somente o campo; sem optimistic — badge usa o `professional.status` da resposta (backend é a autoridade); update local por id após 200 (item que saiu da lista durante o request não é reinserido; sem GET extra no sucesso; busca/página preservadas); `pendingIds` por id com Set imutável (só a linha afetada bloqueia — "Suspendendo..."/"Reativando...", Editar da linha indisponível durante pending; demais linhas operáveis; duplo clique protegido por disabled + guarda); erros: 400/5xx/rede → toast seguro sem alterar badge; 403 → "Acesso negado para esta área." sem logout manual; 404 → toast + refetch preservando busca/página; 401 → interceptor existente (não duplicado); user=null mantém a ação (status pertence ao Professional); `components/ui/alert-dialog.tsx` adicionado (shadcn via `radix-ui` já instalado — nenhuma dependency npm nova); tipos: `ProfessionalStatus`, `status` em `AdminProfessionalItem`/`AdminProfessionalDetailsProfessional`, `AdminUpdateProfessionalStatusPayload` (response reutiliza `AdminProfessionalDetails`)
- `/admin/professionals/new` (d7c81d8): formulário react-hook-form com os 6 campos do contrato (`name`, `slug`, `email`, `firstName`, `lastName`, `password`); slug sugerido a partir do nome enquanto nunca editado manualmente (conveniência de UX — o backend **não** normaliza, apenas valida o formato); após edição manual o nome não sobrescreve o slug; payload exatamente os 6 campos (sem role/ids/timestamps — backend força PROFESSIONAL); senha inicial manual (≥ 8 no frontend; backend autoridade), enviada no POST e não persistida/exibida pelo frontend; 201 → toast + volta à listagem; 400 legível; 409 mapeado ao campo (email/slug) ou geral; 403 sem logout; 5xx/rede com retry; duplo submit bloqueado
- `/admin/professionals/[id]/edit` (714037a): Client Component dentro do grupo `(protected)` (herda o `AdminRoute` — sem guard novo, sem layout novo, sem cliente HTTP novo); `params: Promise<{ id }>` (padrão Next.js 16 do projeto). GET inicial `GET /admin/professionals/:id` preenche o formulário (react-hook-form) com exatamente 5 campos (`name`, `slug`, `email`, `firstName`, `lastName` — password/role/ids/timestamps não são renderizados nem enviados). Loading com skeleton (nunca formulário vazio fingindo dado); resposta obsoleta do GET descartada por guarda de sequência (seqRef — coberta por teste). Slug carregado exatamente como está, sem sugestão automática (mudar o nome não altera o slug) + aviso "Alterar o slug muda a URL pública do profissional."; email editável + aviso "Alterar o e-mail muda a credencial usada pelo profissional para entrar."; validações de UX idênticas ao DTO (obrigatórios, email formato, slug `^[a-z0-9-]+$`) — backend autoridade.
- user=null: aviso "Este profissional não possui usuário associado.", Salvar desabilitado, nenhum PATCH possível, nenhum valor fictício, nenhum User criado automaticamente (backend manteria 409 se tentado).
- PATCH: payload objeto explícito com exatamente os 5 campos (sem spread); duplo submit bloqueado (`isSubmitting`, botão "Salvando..." — teste com Promise pendente prova 1 única chamada). Erros: GET 404 → estado dedicado; PATCH 404 → permanece na tela com formulário preenchido; 409 email/slug mapeados por mensagem exata para o campo; 409 user ausente e 409 residual → erro geral; 409 desconhecido → fallback seguro; 403 sem logout; 5xx/rede → mensagem genérica + retry; 401 → interceptor existente. Redirect + toast apenas no 200. Tipos adicionados em `types/index.ts`: `AdminProfessionalDetails`, `AdminUpdateProfessionalPayload`, `AdminUpdateProfessionalResponse`.
- Dívida não bloqueante: `AdminRoute` e o shell do layout usam instâncias independentes de `useAuth()` → dois `GET /auth/profile` por navegação na área protegida (sem impacto de segurança; não corrigido nesta entrega)
- Testes frontend: Vitest + Testing Library (jsdom), 10 suítes, **221/221** passando, sem backend real (mocks) — suíte do dashboard 62/62 (ver seção "UX frontend do gerenciamento de agendamentos"); suíte da listagem 33/33 cobre badge, ações por status, AlertDialog, payload exato, pending por id (A/B independentes), duplo clique, autoridade da response, non-optimistic, item stale não reinserido, 404 preservando busca/página, erros, regressão e ausência de botão archive; edição+arquivamento: admin-edit-professional 44/44 (inclui 17 de archive); UX de account-state: api-interceptor 25/25, login-suspension 17/17, public-profile-suspension 13/13

### UX frontend de Professional suspenso (e8a1a2d — já pushado)
- **Constantes** (`frontend/lib/suspension.ts`): `SUSPENDED_ACCOUNT_MESSAGE` (espelho exato da string do backend), `SUSPENDED_REASON`, `SUSPENDED_LOGIN_PATH` — fonte única compartilhada pelo interceptor e pela login page (evita divergência entre as pontas)
- **Match exato**: suspensão reconhecida SOMENTE com `status === 403` **E** `message ===` a string exata — sem `includes`, sem regex, sem 403 isolado; 403 comum (ex.: "Permissão insuficiente." do RolesGuard) não encerra sessão; ADMIN nunca é tratado como suspenso
- **Três tratamentos distintos**: 401 = token inválido/expirado (comportamento existente preservado); 403 suspensão = Professional autenticado porém suspenso (remove token + redirect); 403 comum = acesso negado sem logout
- **Interceptor (sessão já ativa)**: request privada com 403 de suspensão → remove `localStorage['token']` → redirect `/login?reason=suspended`; sem toast (requests simultâneas multiplicariam toasts); flag module-level garante um único redirect lógico para múltiplos 403 simultâneos (demais apenas rejeitam); o redirect usa `window.location.href` (reload completo), que recria o módulo e reseta a flag naturalmente
- **`POST /auth/login` é exceção do interceptor**: o 403 do próprio login não dispara logout/redirect global — a página trata a mensagem inline (evita redirect desnecessário, loop e perda de UX)
- **Login UX**: tentativa direta de conta suspensa → mensagem inline com `role="alert"`, token NÃO salvo, sem redirect ao dashboard, formulário utilizável; senha errada mantém a mensagem normal de credencial (sem inferência de suspensão)
- **Query `?reason=suspended`**: carrega apenas um estado sem dados sensíveis; a página converte em texto FIXO frontend — query arbitrária (`foo`, `<script>`, mensagem qualquer) nunca é renderizada diretamente; `useSearchParams` sob `<Suspense>` (exigência do App Router/Next 16)
- **Reativação**: sem polling, sem auto-login, sem recuperação do JWT antigo — o usuário faz novo login normalmente pelo fluxo habitual
- **Perfil público SUSPENDED**: continua visível (nome, bio, serviços, redes, tema) — sem 404, sem redirect; aviso acessível por texto "Este profissional não está aceitando novos agendamentos no momento." (não depende só de cor); enum técnico `SUSPENDED` nunca exibido como label
- **CTA/booking**: "Confirmar agendamento" `disabled` para SUSPENDED + guarda defensiva no `handleBooking` (zero POST disparado pela UI nesse estado); calendário/serviços permanecem visíveis como informação; backend continua a autoridade final
- **Available**: lógica preexistente `available=false`/`slots=[]` preservada — `available` continua a autoridade operacional do calendário; `status` é reforço de UX; um não substitui o outro
- **Booking race**: página carregada ACTIVE → ADMIN suspende → confirmação → backend 403 com mensagem PRÓPRIA de booking → mensagem segura exibida, sem assumir sucesso, sem falso logout (mensagem diferente — não confunde com suspensão de sessão)
- **Histórico do cliente**: `CustomerAppointments`/by-phone/cancel-public intocados — suspensão não remove acesso do cliente ao histórico existente
- **Tipos**: `ProfessionalStatus` reutilizado (nenhuma union paralela); `status` adicionado aos tipos públicos onde o backend garante presença; sem `any` novo
- **Detalhe de teste**: `__resetAccountStateRedirectForTest` (renomeado de `__resetSuspensionRedirectForTest` em 1e3c913) exportado por `lib/api.ts` é usado SOMENTE pelos testes do interceptor (Vitest 3 não tem `vi.isolateModules`; a factory do mock do axios é cacheada por arquivo) — não é API pública da aplicação
- **Testes**: `api-interceptor` 25/25 (401 preservado; suspensão remove token + redirect; `/auth/login` excluído — inclusive shapes `auth/login` e URL completa; 403 comum; ADMIN; múltiplos 403 → 1 redirect; mensagem parecida mas não exata; booking 403; +12 de archived — ver seção abaixo); `login-suspension` 17/17 (mensagem inline + `role=alert`, sem token, sem redirect, query segura, login normal pós-aviso; +8 archived); `public-profile-suspension` 13/13 (ACTIVE com POST real, SUSPENDED visível + aviso + enum oculto + CTA inoperante com zero POST, available vazio, race 403, sem redirect/404; +4 archived)

### UX frontend de Professional arquivado (1e3c913 — pushado, deployado no Vercel e validado em produção em 2026-10-28)
- **Escopo**: somente frontend; nenhuma dependency nova (o `components/ui/alert-dialog.tsx` já existente foi reutilizado); backend/Prisma/migration intocados
- **Ação na edit page**: botão "Arquivar profissional" (variant destructive) em seção separada de perigo no final de `/admin/professionals/[id]/edit` — SOMENTE na edit page (a listagem não tem botão archive — reduz risco de ação acidental); visível em `status === 'ready'` inclusive com user=null (archive não depende de User)
- **AlertDialog obrigatório**: título "Arquivar profissional?"; descrição comunica: perfil deixa de aparecer publicamente, login bloqueado, novos agendamentos bloqueados, dados/histórico preservados, "Agendamentos existentes serão preservados.", sem restauração pela interface nesta versão (sem linguagem de exclusão definitiva); botões Cancelar + "Arquivar profissional" (destructive); sem digitação de slug/nome
- **Request**: `api.delete(url)` com ZERO body (um único argumento, provado por teste); nada de `deletedAt`/`status`/`reason`/payload vazio
- **Loading/race**: estado dedicado `isArchiving` + espelho síncrono `archivingRef` (o Radix dispara close no clique da ação; sem a ref o diálogo fecharia durante o pending); double submit bloqueado (2 cliques → 1 DELETE); Cancelar/confirm ficam protegidos durante pending; diálogo permanece em erro para retry; fecha em sucesso/404/Cancelar
- **Respostas**: 204 (inclusive idempotente — archive concorrente) → toast "Profissional arquivado com sucesso." + redirect `/admin/professionals` (sem segunda request); 404 → toast "Profissional não encontrado." + redirect (sem página stale); 403 comum → erro seguro inline, sem logout; 401 → interceptor existente (não duplicado); 5xx/rede → página permanece, loading resetado, erro seguro, retry possível
- **Constants** (`lib/suspension.ts` — fonte única de account-state, agora suspensão + arquivamento): `ARCHIVED_ACCOUNT_MESSAGE` (espelho exato da string do backend), `ARCHIVED_REASON`, `ARCHIVED_LOGIN_PATH`, `isArchivedAccountError` — match EXATO (`===`), sem includes/regex; match de suspensão preservado
- **Interceptor**: flag ÚNICA compartilhada `accountStateRedirectInProgress` — múltiplos 403 de account-state (suspended e archived entre si) produzem um único redirect; o segundo erro não sobrescreve o destino já iniciado; token removido em todos os matches; `POST /auth/login` excluído para ambos os estados; 401 e 403 comum/booking/RBAC intactos
- **Reset test-only**: `__resetAccountStateRedirectForTest` — existe apenas para isolar o module state nos testes; não faz parte do fluxo runtime
- **Login direto archived**: 403 com mensagem exata → mensagem inline `role="alert"`, zero token salvo, zero redirect ao dashboard, sem loop global; `?reason=archived` → texto fixo frontend; query arbitrária nunca refletida (mapeamento fixo: somente `suspended`/`archived`); wrong password (401) preserva a mensagem normal
- **Público**: archived → 404 → UX not-found atual ("Profissional não encontrado.") — não revela archive/desativação/motivo; matriz pública: ACTIVE normal; SUSPENDED visível com aviso + booking bloqueado; ARCHIVED 404/not-found
- **Types**: sem `ARCHIVED` no `ProfessionalStatus`; sem `deletedAt` nos types frontend — archive continua lifecycle backend, não status operacional exibido
- **Testes**: edit archive 17 (A1–A17: botão, user=null fluxo completo, título/descrição, Cancelar zero DELETE/zero redirect, DELETE sem body, pending, double submit com race síncrona, 204, 204 idempotente, 404, 403, 5xx+retry, rede, 401, loading, save preservado); interceptor archived 12 (27–38: remove token + redirect, dedupe, cross-state nas duas ordens, login excluído nas 3 shapes, mensagem parecida, 403 comum, booking, regressão suspended); login archived 8; public archived 4; listagem sem botão archive 1; ordem de execução independente verificada (interceptor sozinho 25; +login 42; +edit 86; ordem inversa 86; focados 132); `npm run build` PASS
- **Quality review**: 5 fragilidades LOW apenas em testes, corrigidas (user=null fluxo completo; Cancelar prova zero redirect; double-click com race síncrona real; sucesso prova ausência de segunda request; cross-state na ordem inversa); nenhuma correção de production code foi necessária
- **Produção (2026-10-28 — safe smoke PASS)**: `1e3c913` + `a53319c` pushados e deployados no Vercel; `?reason=archived` exato OK; query arbitrária não refletida; `reason=suspended` regressão PASS; login/dashboard/perfil público do Professional ACTIVE PASS; ADMIN login/listagem/edit page/zona de perigo/AlertDialog/botão destructive PASS; Cancelar fecha o diálogo com zero DELETE, zero PATCH, zero toast de sucesso; diálogo reabre normalmente após cancelamento
- **Zero writes no smoke** (deliberadamente não destrutivo): archive DELETE real = 0; status writes = 0; Appointment creates = 0; Professional creates = 0
- **Estado final do banco (produção)**: TOTAL Professionals = 1; ARCHIVED_COUNT = 0; Professional real (jessicasantana) ACTIVE, `deletedAt = null` — nenhum Professional real foi arquivado para o smoke
- **Cenários não executados em produção** (permanecem cobertos pelos testes automatizados — não arquivar o único Professional real apenas para smoke): `REAL_ARCHIVE_PRODUCTION_TEST=NOT_EXECUTED`; `OLD_SESSION_ARCHIVED_REDIRECT=NOT_EXECUTED`; `DIRECT_ARCHIVED_LOGIN=NOT_EXECUTED`

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
- Edição já existe ponta a ponta: backend (`GET`/`PATCH /admin/professionals/:id`, 98f9a46) + formulário `/admin/professionals/[id]/edit` com ação "Editar" na listagem (714037a — ver seção "Backoffice ADMIN — frontend")
- Suspensão/reativação: backend pronto (78bd46e — ver seção "Status operacional"; migration aplicada em produção em 2026-10-25); frontend das ações concluído (ee3a6e2)
- Exclusão operacional (arquivamento lógico/soft delete): backend concluído e publicado (b2f6377 — ver seção "Arquivamento lógico"; migration aplicada em produção em 2026-10-26 + safe smoke PASS); frontend "Arquivar profissional" publicado e validado (1e3c913 — pushado, deployado no Vercel, safe smoke PASS em 2026-10-28); CRUD ADMIN concluído em produção — restore/filtro/purge são backlog futuro separado

## Pontos de Atenção
Ver PROJETO.md → "Lista Priorizada de Problemas" para detalhes.
Ver AGENTS.md → "Pendências de Confirmação" e "Melhorias Planejadas".