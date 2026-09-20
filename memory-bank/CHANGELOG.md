# CHANGELOG

## 2026-09-19 — Correção pré-deploy: endpoints públicos removidos + validação de senha

### Correção — C1: RegisterDto mínimo de senha
- **Problema**: `RegisterDto` sem validação de tamanho de senha — aceitava 1 caractere
- **Correção**: Adicionado `@MinLength(8)` em `password`
- **Testes**: 7/7 RegisterDto validation tests passando

### Correção — C2: POST /professionals público removido
- **Problema**: `POST /professionals` público sem uso no MVP
- **Correção**: Removido `@Post()` create do ProfessionalsController
- **Preservado**: `ProfessionalsService.create` e `CreateProfessionalDto` para onboarding futuro
- **Testes**: 28/28 passando (3 novos supertest HTTP + 25 existentes)

### Correção — C3: POST /auth/register público removido
- **Problema**: `POST /auth/register` público sem uso no MVP — clientes sem conta
- **Correção**: Removido `@Post('register')` + import `RegisterDto` do AuthController
- **Preservado**: `AuthService.register()`, `RegisterDto`, `@MinLength(8)` para onboarding futuro
- **Preservado**: `POST /auth/login` com `@Throttle({ default: { limit: 10, ttl: 60000 } })` intacto
- **Preservado**: `GET /auth/profile` com JwtAuthGuard intacto
- **Testes**: 2/2 auth controller (register 404 + login 201) + 7/7 RegisterDto + 4/4 throttler guard + clean tsc

### Decisão — Paginação do dashboard POST_DEPLOY
- `findByProfessional()` sem take/sip — dashboard calcula TUDO no client
- `take=50` quebraria contagens/histórico
- `findAll()` sem consumidor — código legado/interno
- Decisão: monitorar crescimento e implementar paginação/filtros server-side quando o volume justificar

### Auditoria pré-deploy — SEC-005, SEC-006, SEC-007, SEC-001
- **SEC-005** `GET /services/professional/:professionalId` → INTENTIONAL_PUBLIC_ENDPOINT
  - Página /professional/[slug] precisa dos serviços ativos do profissional
  - Retorna apenas: id, name, description, durationMinutes, price, isActive
  - Não expõe email, password, ou dados privados
- **SEC-006** `GET /professionals` → FIXED (fa6cc2d)
  - DTO FindProfessionalsDto com @Min(1)/@Max(100)/@Type(() => Number)/@IsInt()
  - take = limit ?? 20, skip = offset ?? 0
  - 10/10 testes DTO + 6/6 service passando
  - R3 (GET /professionals sem paginação) corresponde ao mesmo fixing — não duplicar
- **SEC-007** `GET /professionals/slug/:slug` expõe email → OBSOLETE (sem commit de correção)
  - findOneBySlug() no commit original 2cb2695 já não incluía relation User
  - Nenhum commit posterior alterou o include de findOneBySlug
  - O finding antigo foi baseado em suposição — não reprodutível
- **SEC-001** `GET /professionals/:id` sem ownership → DEFERRED
  - @UseGuards(JwtAuthGuard) protege a rota
  - findOneById(id) aceita QUALQUER id arbitrário
  - Inclui user (email, firstName, lastName, role, id)
  - Professional A autenticado pode consultar dados completos de Professional B
  - Post-deploy: adicionar ownership check ou classificar como público

## 2026-09-18 — SEC-003: findByPhone pagination com validação estrita

### Correção de Segurança — SEC-003 (iteração 3)
- **Problema da iteração 1**: `parseInt(queryLimit, 10)` aceitava strings como `"10abc"` → `10`, `limit=-1` → take=-1 → Prisma retorna TUDO (DoS)
- **Problema da iteração 2**: `@Transform(({ value }) => parseInt(value, 10))` rejeitava `"1.5"` mas aceitava `"10abc"` e `"50.9"`
- **Correção final** (padrão do projeto `@Type(() => Number)`):
  - Criado `FindByPhoneQueryDto` com 3 campos: `professionalId`, `limit`, `offset`
  - `professionalId` opcional (`@IsString()`) — NÃO concede autorização
  - `limit` opcional (`@Type(() => Number)` + `@IsInt()` + `@Min(1)` + `@Max(100)`)
  - `offset` opcional (`@Type(() => Number)` + `@IsInt()` + `@Min(0)`)
  - `@Type(() => Number)` rejeita: `"10abc"` → 400, `"1.5"` → 400, `"50.9"` → 400
  - Controller usa `@Query() query: FindByPhoneQueryDto` — DTO representa query completa
  - `professionalId` continua OPCIONAL — contrato não alterado
  - Service usa `??` defaults: `take = limit ?? 50`, `skip = offset ?? 0`
- **Testes**: 20/20 DTO + 6/6 service
  - `{}` → ✅ OK
  - `{ limit: "10" }` → ✅ 10 (typeof number)
  - `{ limit: "100" }` → ✅ OK
  - `{ limit: "101" }` → ❌ 400
  - `{ limit: "10abc" }` → ❌ 400 (rejeitado)
  - `{ limit: "1.5" }` → ❌ 400
  - `{ offset: "20" }` → ✅ OK
  - `{ campoExtra: "x" }` → ❌ 400 (forbidNonWhitelisted)
  - `{ professionalId: "abc" }` → ✅ OK
  - `{ professionalId: "abc", limit: "50", offset: "20" }` → ✅ OK
  - `professionalId` → ✅ encaminhado ao Prisma
  - `professionalId undefined` → ✅ sem filtro
- **Rota**: `GET /appointments/by-phone?phone=...&professionalId=...&limit=...&offset=...`

## 2026-09-17 — SEC-004: Correção final de themeColors + limpeza de working tree

### Correção de Segurança — SEC-004 (iteração 2)
- **Problema da iteração 1**: `@Transform` retornava `{ ...value }` transformando ThemeColorsDto em plain object. Com `whitelist: true` do ValidationPipe global, `primary` era removido do nested ANTES do `@ValidateNested` validar → 400 falso.
- **Correção final**:
  - Removido `@Transform` de `UpdateProfessionalProfileDto`
  - Adicionado `@IsObject() @ValidateNested() @Type(() => ThemeColorsDto)`
  - `themeColors` tipado como `ThemeColorsDto | null`
  - Service converte para plain object com spread `{ ...dto.themeColors }` antes de enviar ao Prisma
- **Resultado**: nested DTO é ThemeColorsDto real (`instanceof` === true)
- **Testes finais**: 9/9 passando com ValidationPipe REAL + metatype
  - `{}` → ✅ OK
  - themeColors ausente → ✅ undefined
  - `{ primary }` → ✅ OK
  - `{ primary, secondary, accent }` → ✅ OK
  - `{ primary: 123 }` → ❌ 400 (IsString)
  - `"texto"` → ❌ 400 (IsObject)
  - `[]` → ❌ 400 (IsObject)
  - `{ primary, campoExtra }` → ❌ 400 (forbidNonWhitelisted)
  - `null` → ✅ null (não atualizar)

### Limpeza de Working Tree
- Revertido 22 arquivos PURE_FORMATTING (ruído de lint --fix)
- Availabilities, Services, Prisma, Auth (parcial): confirmados como PURE_FORMATTING
- 9 arquivos funcionais preservados (SEC-002, SEC-003, SEC-004)
- Removidos 4 arquivos temporários de debug

### Testes Executados
- `theme-colors-validation.spec.ts`: 9/9 passing
- `npx tsc --noEmit`: clean

## 2026-09-16 — JWT_SECRET: remoção do fallback hardcoded

### Correção de Segurança
- Criada função centralizada `requireJwtSecret()` em `backend/src/auth/jwt-validation.ts`
- `JWT_SECRET` agora é **obrigatório** — ausência, valor vazio ou somente espaços impedem inicialização
- `auth.module.ts` e `jwt.strategy.ts` usam **exatamente a mesma função** `requireJwtSecret()`
- Removido fallback `'pex_agendamento_secret_key_2026_change_me_in_production'` de 2 arquivos
- Gate em `main.ts` após `dotenv.config()` — lança Error antes do bootstrap
- Criado `backend/.env.example` com variáveis documentadas (placeholder fictício)
- `.gitignore` atualizado para não ignorar `.env.example`
- Tokens antigos só serão rejeitados se o segredo real mudar

### Arquivos Modificados
- `backend/src/main.ts` — import + gate `requireJwtSecret()`
- `backend/src/auth/auth.module.ts` — `secret: requireJwtSecret()` no useFactory
- `backend/src/auth/jwt.strategy.ts` — `secretOrKey: requireJwtSecret()`
- `backend/.env.example` — criado (não contém segredo real)
- `.gitignore` (raiz) — exceção `!.env.example`
- `AGENTS.md` — risco resolvido
- `docs/ARQUITETURA.md` — referência atualizada
- `PROJETO.md` — A1 marcado como resolvido
- `README.md` — nota sobre fallback removida

### Testes Executados
- CASO A (undefined): ✅ PASSOU — throw Error
- CASO B (vazio): ✅ PASSOU — throw Error
- CASO C (só espaços): ✅ PASSOU — throw Error
- CASO D (válido): ✅ PASSOU — retorna valor

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