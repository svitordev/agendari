c# PROJETO.md — Visão Geral Executiva

## Objetivo
Plataforma de agendamento para manicures/profissionais da beleza, iniciando como MVP para uma profissional parceira e evoluindo para SaaS multi-tenant.

## Fases

### Fase 1 (MVP) — Em Execução
- [x] Fluxo completo de agendamento de clientes
- [x] Visualização de horários disponíveis
- [x] Gestão de disponibilidade com múltiplos períodos
- [x] Gestão de exceções/bloqueios
- [x] Dashboard do profissional com CRUD de serviços, disponibilidade e perfil
- [x] Página pública por slug (/professional/jessicasantana)
- [x] Confirmação/cancelamento de agendamentos
- [x] Consulta pública de agendamentos por telefone
- [x] Backoffice ADMIN read-only: login ADMIN + listagem paginada de profissionais (f420ac0)
- [x] Backend ADMIN cria Professional + User atomicamente (cfc4ad2)
- [x] Frontend ADMIN de criação: formulário /admin/professionals/new integrado ao POST (d7c81d8)
- [x] Backend ADMIN de edição: GET individual + PATCH completo (5 campos), nested write atômica Professional + User (98f9a46)
- [x] Frontend ADMIN de edição: rota /admin/professionals/[id]/edit + ação Editar na listagem — edição ADMIN end-to-end dos 5 campos permitidos (714037a)
- [x] Backend ADMIN de suspensão/reativação: `ProfessionalStatus` + `PATCH /admin/professionals/:id/status` + enforcement em JwtStrategy/login/booking (78bd46e — migration aplicada em produção em 2026-10-25; backend publicado + safe smoke PASS)
- [x] Frontend ADMIN de suspensão/reativação: coluna Status (badge Ativo/Suspenso) + ação Suspender (com AlertDialog de confirmação) + Reativar direta na listagem (ee3a6e2)
- [x] Frontend UX de Professional suspenso: login suspenso com aviso inline, sessão já ativa encerrada pelo interceptor (token removido, `/login?reason=suspended`), aviso público de indisponibilidade no perfil, CTA de novo agendamento bloqueado (e8a1a2d — já pushado)
- [x] Backend ADMIN de arquivamento lógico (soft delete): `Professional.deletedAt` + `DELETE /admin/professionals/:id` (204, idempotente, zero hard delete) + enforcement em auth/JWT/admin/público + leak `deletedAt` corrigido (b2f6377 — já pushado; migration aplicada em produção em 2026-10-26 + safe smoke PASS; restore/purge são features futuras separadas)
- [x] Frontend ADMIN de arquivamento: botão "Arquivar profissional" somente na edit page (zona de perigo + AlertDialog), sessão archived encerrada centralmente (`/login?reason=archived`), direct archived login inline, public archived not-found, testes 159/159 (1e3c913 — commit local, ainda NÃO pushado; Vercel ainda NÃO validado)
- [ ] CRUD completo de profissionais pelo ADMIN — CRUD ADMIN implementado em código; fechamento de produção pendente de deploy/smoke frontend (push de 1e3c913 + deploy Vercel + smoke)
- [ ] Correções de segurança identificadas na auditoria (ver abaixo)

### Fase 2 (SaaS) — Planejada
- Landing page institucional com listagem de profissionais
- Múltiplos profissionais/tenants com isolamento completo
- Customização visual de páginas públicas (cores/tema via themeColors)
- Autenticação robusta com validações de produção
- Rate limiting e proteção CSRF/XSS

## Stack (Estado Confirmado — 2026-08-27)

| Componente | Backend | Frontend |
|---|---|---|
| Framework | NestJS 11 | Next.js 16.3.1 (App Router) |
| Linguagem | TypeScript 5.7.3 (`strictNullChecks: false`) | TypeScript (`strict: true`) |
| ORM/DB | Prisma 6 + PostgreSQL | — |
| Autenticação | JWT + Passport + bcrypt | localStorage + useAuth |
| UI | — | Tailwind CSS + shadcn/ui |

## Arquitetura Backend — 7 Módulos

| Módulo | Descrição |
|---|---|
| auth | register, login, profile (guard JWT) |
| professionals | CRUD + perfil público por slug |
| appointments | CRUD + rotas públicas (criação, consulta por telefone, cancelamento) |
| services | CRUD ⚠️ SEM GUARDS |
| availabilities | CRUD completo com guards + exceções + múltiplos períodos |
| admin | RBAC (@Roles ADMIN): me, listagem read-only, criação Professional + User, edição (GET individual + PATCH completo de 5 campos; password/role fora), status operacional (suspensão/reativação — 78bd46e), arquivamento lógico (soft delete via deletedAt — b2f6377) |
| prisma | PrismaService @Global |

## Multi-tenant — Estado Atual

### Implementado ✅
- Appointments: `professionalId` do JWT em todas rotas protegidas
- Availabilities: `professionalId` do JWT em todas rotas protegidas
- Professionals/me: `professionalId` do JWT

### Problemas ⚠️
- Services: ZERO guards — qualquer pessoa pode fazer CRUD
- Professionals/:id: ✅ **RESOLVIDO** (cd0cd21) — ownership via `req.user`; cross-tenant → 404, sem professionalId → 403
- GET /professionals: rota pública — documentação atualizada para registrar que o payload é limitado a dados públicos (Professional + services ativos + availabilities ativas com períodos). Não inclui User (email, senha, role)

## Regras Críticas
- Sempre responder em português BR
- Rotas privadas: ownership via `req.user.professionalId` (backend) ou `useAuth()` (frontend)
- Rotas públicas: `professionalId` como identificador do alvo é permitido via query/body
- Nunca confiar em `professionalId` do frontend para autorização
- Atualizar documentação `.md` APENAS para mudanças relevantes (ver AGENTS.md)
- Diferenciar: ESTADO ATUAL, RISCO CONFIRMADO, PENDENTE, MELHORIA PLANEJADA

## Lista Priorizada de Problemas

### 🔴 CRÍTICO

| # | Problema | Arquivo | Descrição |
|---|---|---|---|
| C1 | Services CRUD sem guard | `services.controller.ts` | POST/PATCH/DELETE 100% públicos — qualquer um pode criar/editar/excluir serviços de qualquer profissional |
| C2 | ~~Professionals/:id sem ownership~~ | `professionals.service.ts` | ✅ **RESOLVIDO** (cd0cd21) — ownership via `req.user`; cross-tenant → 404, sem professionalId → 403 |
| C3 | Register permite ADMIN | `register.dto.ts:21` + `auth.service.ts` | `@IsIn(['ADMIN','PROFESSIONAL','CUSTOMER'])` sem validação — qualquer um registra ADMIN |

### 🟠 ALTO

| # | Problema | Arquivo | Descrição |
|---|---|---|---|
| A1 | ~~JWT_SECRET hardcoded fallback~~ | `jwt-validation.ts:1` → `auth.module.ts:14` + `jwt.strategy.ts:12` | ✅ **RESOLVIDO** — `requireJwtSecret()` lançada em `main.ts` antes do bootstrap |
| A2 | XSS via localStorage | `lib/api.ts:12` + `hooks/useAuth.ts:24` | JWT em localStorage é lido por qualquer script JS — vulnerável a XSS |
| A3 | POST /professionals sem guard | `professionals.controller.ts:22-28` | Criação pública de profissionais |
| A4 | Frontend serviços busca global | `services/page.tsx:76` | `api.get('/services')` sem filtrar por professionalId — retorna serviços de todos |
| A5 | /appointments/by-phone sem prova de posse | `appointments.service.ts` | Consulta depende apenas do conhecimento do telefone — OTP planejado |
| A6 | CORS hardcoded localhost | `main.ts:11` | Não funciona em produção sem alterar código |
| A7 | strictNullChecks: false | `backend/tsconfig.json:17` | Permite null/undefined inseguros — dívida técnica (melhoria planejada) |

### 🟡 MÉDIO

| # | Problema | Arquivo | Descrição |
|---|---|---|---|
| M1 | CustomerAppointments duplicado | `components/public/` e `components/Public/` | Casing diferente — quebra em case-sensitive (Linux/prod) |
| M2 | `req: any` em todos controllers | Múltiplos | Perde tipagem do user |
| M3 | Sem rate limiting global | — | Login/register/criação agendamento vulneráveis |
| M4 | themeColors aceita qualquer JSON | `update-professional-profile.dto.ts:35-37` | `@IsObject()` sem validação interna |
| M5 | Frontend types desatualizado | `types/index.ts` | `themeColors` não opcional no tipo, `Json?` no schema |
| M6 | Seed com `update: {}` | `seed.ts` | Se dados existirem, não atualiza |

### 🟢 BAIXO / INFO

| # | Item | Descrição |
|---|---|---|
| B1 | Sem `.env.example` | Dificulta setup |
| B2 | Sem global error handler customizado | 500 genéricos |
| I1 | Seed dev-only com senha hardcoded | **NUNCA usar credenciais de seed em produção** |

### ⏸ PENDENTE DE CONFIRMAÇÃO

| # | Item | Por quê |
|---|---|---|
| P1 | Git tracking de `backend/.env` | `backend/.gitignore` tem `.env` (linha 39), raiz tem `.env*` (linha 34) — mas `git ls-files` não executado |
| P2 | Existência de migrations em `backend/prisma/migrations/` | Não confirmado sem listagem de diretório |
| P3 | Seed compatível com schema atual (AvailabilityPeriod) | Necessita teste de execução real |

## Melhorias Planejadas
1. Migrar `strictNullChecks: false` → `true` no backend (migração controlada futura)
2. ~~Fazer app falhar se JWT_SECRET não estiver definido~~ ✅ RESOLVIDO (2026-09-16)
3. OTP/token para verificação de posse de telefone
4. HTTP-only cookie ou memória efêmera para JWT (em vez de localStorage)
5. Rate limiting em rotas sensíveis
6. Ownership check em `GET /professionals/:id`
7. Guards em CRUD de services
8. Remover permissão de criar ADMIN via register público
9. Migrar CORS para config via env var
10. Adicionar `.env.example`