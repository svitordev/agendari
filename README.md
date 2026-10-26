# PEX Agendamento

> Plataforma de agendamento para manicures/profissionais da beleza

## Status do Projeto
- **Fase 1 (MVP):** Em execução — código funcional com auditoria de segurança realizada
- **Fase 2 (SaaS):** Planejada — multi-tenant com isolamento completo

## Tecnologias

### Backend
| Componente | Tecnologia | Versão |
|---|---|---|
| Framework | NestJS | ^11.0.1 |
| Linguagem | TypeScript | ^5.7.3 |
| ORM | Prisma | ^6.11.1 |
| Banco | PostgreSQL | — |
| Autenticação | JWT + Passport + bcrypt | — |
| Validação | class-validator + class-transformer | — |

### Frontend
| Componente | Tecnologia | Versão |
|---|---|---|
| Framework | Next.js (App Router) | 16.3.1 |
| Runtime | React | 19.2.8 |
| Linguagem | TypeScript (strict: true) | — |
| Estilização | Tailwind CSS + shadcn/ui | ^4 |
| Formulários | react-hook-form | ^7.86.0 |
| Datas | date-fns (pt-BR) + react-calendar | — |
| Testes | Vitest + Testing Library (jsdom) | — |

## Estrutura

```
pex-agendamento/
├── backend/          # API NestJS — 7 módulos
├── frontend/         # Web app Next.js — App Router
├── .clinerules/      # Regras de desenvolvimento por área
├── docs/             # Documentação técnica detalhada
└── memory-bank/      # Histórico do projeto
```

### Módulos Backend

| Módulo | Rotas | Auth | Descrição |
|---|---|---:|---|
| auth | POST /auth/register, /auth/login, GET /auth/profile | parcial | Registro, login, perfil |
| professionals | POST /professionals, GET /professionals, GET /professionals/me, PATCH /professionals/me/profile, GET /professionals/slug/:slug, GET /professionals/:id | parcial | CRUD + perfil público |
| appointments | POST /appointments, GET /appointments/available, GET /appointments/by-phone, PATCH /appointments/:id/cancel-public, GET/PATCH/DELETE /appointments/* | parcial | CRUD + rotas públicas |
| services | POST/GET/PATCH/DELETE /services/* | ❌ | CRUD serviços ⚠️ sem guard |
| availabilities | CRUD completo + exceções + períodos | ✅ | Disponibilidade com guards |
| admin | GET /admin/me, GET /admin/professionals, GET /admin/professionals/:id, POST /admin/professionals, PATCH /admin/professionals/:id, PATCH /admin/professionals/:id/status, DELETE /admin/professionals/:id | ✅ | RBAC — acesso restrito a ADMIN (`@Roles(Role.ADMIN)`); listagem read-only com paginação/search + criação de Professional + User (nested write, role forçada PROFESSIONAL) + edição administrativa (GET individual + PATCH completo de 5 campos; password/role fora) + mudança de status operacional (suspensão/reativação, idempotente) — criação, edição e status consumidos pelo backoffice frontend (badge + ações com confirmação — ee3a6e2) + arquivamento lógico (soft delete via `deletedAt`, 204 idempotente — b2f6377, frontend pendente) |

### Rotas Frontend

| Rota | Acesso | Descrição |
|---|---|---|
| `/login` | público | Login do profissional (exibe aviso para conta suspensa — e8a1a2d) |
| `/dashboard/*` | auth | Painel do profissional |
| `/agendamentos` | público | Consulta pública por telefone |
| `/professional/[slug]` | público | Página pública do profissional (aviso de indisponibilidade para suspensos — e8a1a2d) |
| `/admin/login` | público | Login do backoffice (somente ADMIN conclui o acesso) |
| `/admin` | ADMIN | Painel administrativo read-only |
| `/admin/professionals` | ADMIN | Listagem de profissionais + coluna Status (badge) + ações Suspender/Reativar (ee3a6e2) |
| `/admin/professionals/new` | ADMIN | Criação de profissional (formulário; backend força role PROFESSIONAL) |
| `/admin/professionals/[id]/edit` | ADMIN | Edição de profissional (formulário de 5 campos; password/role fora) |

## Configuração

### Pré-requisitos
- Node.js 18+
- PostgreSQL
- npm (package-lock.json presente)

### Setup

```bash
# 1. Instalar dependências
cd backend && npm install
cd ../frontend && npm install

# 2. Configurar variáveis de ambiente
# Criar backend/.env com:
# - DATABASE_URL
# - JWT_SECRET

# 3. Banco de dados (desenvolvimento)
cd backend
npx prisma generate
npx prisma migrate dev

# Ou, para setup inicial sem migrations:
# npx prisma db push

# 4. Seed (cria credenciais de desenvolvimento)
npx prisma db seed
# Consultar prisma/seed.ts para ver as credenciais criadas

# 5. Executar
# Terminal 1 — Backend (porta 4000)
cd backend && npm run start:dev

# Terminal 2 — Frontend (porta 3000)
cd frontend && npm run dev
```

### Observações Importantes
- Backend usa `strictNullChecks: false` — **não alterar automaticamente** (migração planejada)
- `.env` está em `.gitignore` — **nunca commitar**
- JWT_SECRET é **obrigatório** — `requireJwtSecret()` em `main.ts` falha se ausente/ vazio
- Backend: `npm test` roda Jest (260 testes, 21 suítes, Prisma mockado, sem banco real)
- Frontend: `npm run test` roda Vitest (117 testes, 9 suítes, mocks — sem backend real)
- Migration `20261023000000_add_professional_status` (`Professional.status`, default ACTIVE) — **aplicada em produção (2026-10-25)**; backend correspondente publicado e validado por safe smoke
- Suspensão de Professional no frontend (e8a1a2d — commit local, ainda não pushado): login de conta suspensa mostra aviso inline; sessão já ativa é encerrada (token removido, redirect `/login?reason=suspended`); perfil público suspenso continua visível com aviso; novo agendamento bloqueado pela UI — backend continua a autoridade. Detalhes em `docs/ARQUITETURA.md`
- Arquivamento de Professional (soft delete — b2f6377 — commit local, ainda não pushado): remoção operacional é via `Professional.deletedAt` (lifecycle; `ProfessionalStatus` permanece ACTIVE/SUSPENDED); `DELETE /admin/professionals/:id` (ADMIN, sem body, 204, idempotente); sem hard delete — User/Services/Availability/Appointments preservados; arquivado some das listagens, slug público vira 404, login/JWT e novo booking bloqueados server-side; migration `20261026000000_add_professional_deleted_at` **ainda NÃO aplicada em produção**; frontend de archive ainda pendente. Detalhes em `docs/ARQUITETURA.md`
- Documentação detalhada: ver `PROJETO.md` e `docs/ARQUITETURA.md`