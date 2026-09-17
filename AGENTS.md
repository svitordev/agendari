# AGENTS.md - Guia para Agentes de IA

## Visão Geral do Projeto
Plataforma de agendamento para manicures/profissionais da beleza. Fase 1: MVP para uma profissional parceira. Fase 2: SaaS multi-tenant.

## Stack Tecnológica

### Backend (NestJS 11)
- TypeScript 5.7.3 — ⚠️ `strictNullChecks: false` em `backend/tsconfig.json:17` (dívida técnica — ver Melhoria Planejada abaixo)
- Prisma ORM ^6.11.1 + PostgreSQL
- class-validator + class-transformer em todos os DTOs
- JWT + Passport + bcrypt para autenticação
- Injeção de dependência NestJS obrigatória
- ValidationPipe global com `whitelist`, `forbidNonWhitelisted` e `transform`

### Frontend (Next.js 16.3.1 — App Router)
- React 19 com componentes funcionais + Hooks
- TypeScript com `strict: true`
- Tailwind CSS + shadcn/ui
- react-hook-form, date-fns (pt-BR), react-calendar
- Axios centralizado em `lib/api.ts` com interceptors de auth

### Regras Essenciais
- **Sempre responder em português BR**
- Documentar mudanças RELEVANTES no README e `docs/` (ver "Quando atualizar documentação" abaixo)
- Manter TypeScript strict no frontend (backend: `strictNullChecks: false` é dívida técnica planejada)

## professionalId — Regra Central

### Rotas Privadas / Operações Autenticadas
- Ownership/identidade deve vir EXCLUSIVAMENTE de `req.user.professionalId` (backend)
- Nunca confiar em `professionalId` recebido do body/query para autorização
- Frontend: usar `useAuth()` para obter `professionalId` do usuário logado

### Rotas Públicas
- `professionalId` pode ser recebido como identificador do profissional-alvo (ex: `GET /appointments/available?professionalId=xxx`)
- Isso NÃO concede acesso a dados ou operações privadas
- Exemplo: `/professional/[slug]` carrega dados públicos pelo slug, nunca pelo `useAuth()`

## Estrutura de Pastas
- `backend/src/` módulos por domínio: appointments, professionals, services, availabilities, auth, prisma
- `frontend/app/` rotas Next.js App Router
- `frontend/components/ui/` componentes de UI reutilizáveis
- `.clinerules/` regras específicas por área
- `docs/` documentação técnica e de produto
- `memory-bank/` histórico/contexto do projeto

## Quando Atualizar Documentação

Documentação obrigatória APENAS ao alterar:
- Arquitetura (novos módulos, remoção de módulos)
- Schema/migrations do banco
- Endpoints ou contratos de API
- Autenticação/autorização (novos guards, mudanças de permissionamento)
- Segurança (novos riscos, correções)
- Regras de negócio (fluxos, transições, validações)
- Fluxos importantes
- Dependências estruturais

NÃO é obrigado atualizar `.md` para pequenas edições de código
(refatoração, correção de bug, ajuste visual, rename de variável).

## Fluxo de Trabalho
1. Analisar contexto existente antes de alterar código
2. Seguir regras em `.clinerules/`
3. Atualizar documentação após mudanças RELEVANTES (ver lista acima)
4. Validar tipos e testes existentes
5. Diferenciar claramente em documentos:
   - **ESTADO ATUAL CONFIRMADO** — o que existe no código
   - **RISCO/PROBLEMA CONFIRMADO** — evidenciado no código
   - **PENDENTE DE CONFIRMAÇÃO** — não pode ser verificado agora
   - **MELHORIA PLANEJADA** — mudanças futuras desejadas

## Documentação Obrigatória
- README.md na raiz
- AGENTS.md com visão geral para agente de IA
- PROJETO.md com visão geral executiva
- `docs/` com guias técnicos específicos
- `memory-bank/` com histórico do projeto

## JWT — Formato Real

### Payload Assinado (JwtStrategy)
```ts
{ sub: user.id, email: user.email }
// expiresIn: '24h'
```

### req.user Após JwtStrategy.validate()
```ts
{
  userId: string;
  email: string;
  role: Role;
  professionalId: string | undefined;  // do Professional relacionado
  firstName: string;
  lastName: string;
}
```

### JWT_SECRET — Obrigatório
Arquivo `backend/src/auth/jwt-validation.ts`:
```ts
export function requireJwtSecret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || value.trim() === '') {
    throw new Error('JWT_SECRET não está definido ou está vazio.');
  }
  return value;
}
```
- Se `.env` não estiver presente ou estiver vazio, a aplicação **falha** ao iniciar.
- `auth.module.ts` e `jwt.strategy.ts` usam a mesma função `requireJwtSecret()`.

## Prisma — Models Confirmados (8 models, 3 enums)

| Model | Chave | Relacionamentos |
|---|---|---|
| **User** | id (cuid) | 1→0..1 Professional (via professionalId FK, Cascade) |
| **Professional** | id (cuid), slug (unique) | 0..1→1 User, 1→N Service, Appointment, Availability, AvailabilityException |
| **Service** | id (cuid) | N→1 Professional (Cascade), 1→N Appointment |
| **Appointment** | id (cuid) | N→1 Professional, N→1 Service, N→0..1 Customer |
| **Customer** | id (cuid) | 0..1→N Appointment |
| **Availability** | id (cuid), unique(professionalId, dayOfWeek) | 1→N AvailabilityPeriod |
| **AvailabilityPeriod** | id (cuid), unique(availabilityId, startTime) | N→1 Availability (Cascade) |
| **AvailabilityException** | id (cuid) | N→1 Professional |

### Enums
```prisma
enum Role { ADMIN, PROFESSIONAL (default), CUSTOMER }
enum AppointmentStatus { PENDING, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW }
enum AppointmentCancelledBy { PROFESSIONAL, CUSTOMER }
```

## Regras de Negócio — Implementação Confirmada

| Regra | Status | Onde |
|---|:---:|---|
| Múltiplos períodos por dia | ✅ | `AvailabilityPeriod[]` em `Availability` |
| Serviço deve caber dentro de um período | ✅ | `appointments.service.ts` → `fitsInsidePeriod()` |
| Exceções/bloqueios (dia inteiro OU período) | ✅ | `AvailabilityException` com `allDay` boolean |
| Conflitos PENDING/CONFIRMED bloqueiam horários | ✅ | `findAvailableSlots()` |
| PENDING → CONFIRMED ou CANCELLED | ✅ | `updateStatus()` com `allowedTransitions` |
| CONFIRMED → COMPLETED, CANCELLED, NO_SHOW | ✅ | mesma função |
| Cancelamento profissional exige motivo | ✅ | `reason` obrigatório |
| Cancelamento cliente valida telefone | ✅ | `cancelPublic()` normaliza e compara phone |
| Exclusão apenas de finalizados | ✅ | `removableStatuses: [CANCELLED, COMPLETED, NO_SHOW]` |
| PENDING/CONFIRMED não podem ser apagados | ✅ | `remove()` com `BadRequestException` |
| ThemeColors JSON no Professional | ✅ | `themeColors Json?` no schema |

## Ownership — Status por Módulo

| Módulo | privateId via JWT | Estado |
|---|---|---|
| appointments | ✅ | Todas rotas protegidas usam `req.user?.professionalId` |
| availabilities | ✅ | Todas rotas protegidas usam `req.user?.professionalId` |
| professionals/me | ✅ | `req.user?.professionalId` |
| professionals/:id | ❌ | Guard sim, mas sem ownership check — retorna User de qualquer pro (RISCO C2) |
| services | ❌ | Sem guards nenhum — 100% público (RISCO C1) |

## Pendências de Confirmação

| # | Item | Por quê |
|---|---|---|
| 1 | Git tracking do `backend/.env` | `backend/.gitignore` lista `.env`, mas `git ls-files` não executado |
| 2 | Existência de `backend/prisma/migrations/` | Não confirmado sem listagem de diretório |
| 3 | Seed compatível com schema atual (AvailabilityPeriod) | Necessita teste de execução |

## Melhorias Planejadas
1. Migrar `strictNullChecks: false` → `true` no backend (migração controlada futura)
2. Fazer app falhar se JWT_SECRET não estiver definido
3. OTP/token para verificação de posse de telefone
4. HTTP-only cookie para JWT (em vez de localStorage — risco XSS)
5. Rate limiting em rotas sensíveis
6. Ownership check em `GET /professionals/:id`
7. Guards em CRUD de services
8. Remover permissão de criar ADMIN via register público
9. Migrar CORS de hardcoded para env var