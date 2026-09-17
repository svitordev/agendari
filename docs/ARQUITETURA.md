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

### Ownership por Módulo
| Módulo | Ownership | Observação |
|---|---|---|
| appointments | ✅ | Sempre `req.user?.professionalId` em rotas protegidas |
| availabilities | ✅ | Sempre `req.user?.professionalId` em rotas protegidas |
| professionals/me | ✅ | `req.user?.professionalId` |
| professionals/:id | ❌ | Sem ownership check — retorna User de qualquer pro |
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

### Autenticação
- `useAuth()` hook com localStorage para JWT
- Axios interceptors para Bearer token e redirect 401
- ProtectedRoute wrapper no dashboard layout
- ⚠️ localStorage vulnerável a XSS — ver PROJETO.md A2

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

## Pontos de Atenção
Ver PROJETO.md → "Lista Priorizada de Problemas" para detalhes.
Ver AGENTS.md → "Pendências de Confirmação" e "Melhorias Planejadas".