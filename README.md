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

## Estrutura

```
pex-agendamento/
├── backend/          # API NestJS — 6 módulos
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
- Documentação detalhada: ver `PROJETO.md` e `docs/ARQUITETURA.md`