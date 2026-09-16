# CHANGELOG

## 2026-09-15 — Registro Público: role removido do RegisterDto

### Correção de Segurança
- Removido campo `role` de `RegisterDto` — cliente não escolhe mais role
- `AuthService.register()` hardcoded `role: 'PROFESSIONAL'`
- Requisições com `role` no body rejeitadas com 400 Bad Request (ValidationPipe whitelist)
- Zero referências a `dto.role` no código backend

### Testes Executados
- CASO 1 (sem role): ✅ PASSOU — role = "PROFESSIONAL"
- CASO 2 (role=ADMIN): ✅ PASSOU — 400 "property role should not exist"
- CASO 3 (role=CUSTOMER): ✅ PASSOU — 400 "property role should not exist"
- CASO 4 (role=PROFESSIONAL): ✅ PASSOU — 400 "property role should not exist"

## 2026-08-27 — Auditoria Completa da Base de Código

### Análise Realizada
Leitura e verificação de ~50 arquivos (backend: controllers, services, DTOs, guards,
schema, seed, configs) e ~20 arquivos (frontend: pages, components, hooks, types, libs,
configs). Confirmação de arquitetura, regras de negócio, fluxos de autenticação e contratos API.

### Descobertas — Confirmado como Correto ✅
- JWT retorna professionalId no `req.user` (JwtStrategy carrega User + Professional)
- Appointments usa ownership (`req.user?.professionalId`) em todas rotas protegidas
- Availabilities usa ownership em todas rotas protegidas
- Regras de exclusão de agendamentos implementadas (só finalizados)
- Múltiplos períodos por dia suportados via AvailabilityPeriod
- `fitsInsidePeriod()` funciona corretamente
- Cancelamento público valida telefone

### Problemas Identificados 🔴🟠🟡
Ver PROJETO.md → "Lista Priorizada de Problemas" para detalhes completos.
Resumo:
- 3 críticos (services sem guards, professionals/:id sem ownership, register permite ADMIN)
- 7 altos (JWT_SECRET hardcoded, XSS localStorage, CORS hardcoded, strictNullChecks, etc.)
- 6 médios (duplicação CustomerAppointments, req:any, sem rate limiting, etc.)

### Pendências de Confirmação ⏸
- Git tracking de backend/.env (terminal indisponível)
- Existência de migrations em prisma/migrations (terminal indisponível)
- Seed compatível com schema atual AvailabilityPeriod (necessita teste)

### O Que NÃO Alteramos Nesta Auditoria
- Nenhum arquivo de código (.ts, .tsx, .prisma, .json, .env)
- Apenas documentação foi atualizada
- Correções de código requerem autorização explícita

## 2026-08-23 — Documentação Inicial
- Criados .clinerules/rules.backend.md e rules.frontend.md
- Criado AGENTS.md com regras para agentes de IA
- Criado README.md, PROJETO.md
- Criada pasta docs/ com ARQUITETURA.md
- Criada pasta memory-bank/
- Documentação reforça: sempre responder em português BR

## Próximos Passos

### Prioridade 1 (Segurança Crítica) — Requer Autorização
- [ ] Adicionar guards ao CRUD de services
- [ ] Adicionar ownership check em GET /professionals/:id
- [ ] Restringir role no register público
- [ ] Implementar fail-safe se JWT_SECRET não estiver definido

### Prioridade 2 (Segurança Alta)
- [ ] Avaliar migração JWT de localStorage para httpOnly cookie
- [ ] Adicionar rate limiting em rotas sensíveis
- [ ] Corrigir CORS hardcoded (env var)
- [ ] Corrigir frontend services/page.tsx para filtrar por professionalId

### Prioridade 3 (Dívida Técnica)
- [ ] Planejar migração strictNullChecks: true no backend
- [ ] Sincronizar types/index.ts com schema.prisma
- [ ] Investigar duplicação CustomerAppointments (public/ vs Public/)
- [ ] Adicionar testes .spec.ts

### Prioridade 4 (Melhorias)
- [ ] Adicionar .env.example
- [ ] OTP para verificação de posse de telefone
- [ ] Global error handler customizado