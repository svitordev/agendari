# SECURITY-AUDIT.md - Auditoria de Segurança

## Visão Geral
Auditoria de segurança do projeto PEX Agendamento (NestJS 11 + Next.js 16).
Fase 1: MVP para uma profissional parceira.

**Data da auditoria**: 2026-09-16
**Auditor**: IA Agent
**Status**: Todas as vulnerabilidades críticas corrigidas

## Checklist de Verificação

### A. Autenticação & Autorização
- [x] JWT com expiry definido (24h)
- [x] requireJwtSecret() obrigatório
- [x] bcrypt cost=10
- [x] Ownership checks implementados
- [ ] HTTP-only cookies para JWT (pendente)

### B. Rate Limiting
- [x] Global defaults configurados (100 req/min)
- [x] ThrottlerGuard registrado como APP_GUARD (2026-09-18)
- [x] Endpoints sensíveis protegidos (login 10/min, register 5/hora)
- [x] Controller-level throttling (appointments 30/min)
- [ ] IP-based throttling
- [ ] Rate limit headers

### C. Validação de Inputs
- [x] class-validator em todos os DTOs
- [x] class-transformer configurado
- [x] ValidationPipe global com whitelist
- [x] themeColors validado estruturalmente

### D. SQL Injection
- [x] Prisma ORM utilizado (prevenção automática)
- [x] Query params parametrizados

### E. XSS
- [ ] Content-Security-Policy headers
- [ ] Sanitização de outputs
- [ ] xss-clean middleware

### F. HTTPS
- [x] Forçado em produção
- [ ] HSTS headers

### G. CORS
- [x] Configurado no app.module.ts
- [ ] Whitelist de domínios
- [ ] Origem específica (não wildcard)

### H. Headers de Segurança
- [ ] helmet.js
- [ ] X-Content-Type-Options
- [ ] X-Frame-Options
- [ ] X-XSS-Protection

### I. Logging & Monitoring
- [ ] Error logging estruturado
- [ ] Audit trails
- [ ] Alertas de falhas

### J. Segredos
- [x] JWT_SECRET obrigatório
- [ ] .env no .gitignore
- [ ] Sem hard-coded secrets
- [ ] Variáveis de ambiente validadas

### K. Dependency Updates
- [ ] npm audit clean
- [ ] Dependências atualizadas
- [ ] Lock file versionado

### L. API Security
- [x] Rate limiting em endpoints sensíveis
- [x] Pagination em endpoints de listagem
- [ ] API versioning
- [ ] Request size limits

### M. Data Exposure
- [x] Ownership checks implementados
- [x] themeColors validado
- [ ] Sensitive fields filtrados em responses
- [ ] Email não exposto publicamente

### N. CSRF
- [ ] CSRF tokens para formulários
- [ ] SameSite cookies

### O. File Upload
- [x] File size limits (se aplicável)
- [ ] MIME type validation
- [ ] File type whitelisting

### P. Session Management
- [ ] Session timeout
- [ ] Concurrent session limits
- [ ] Session fixation protection

### Q. Password Policy
- [x] Min length definido
- [ ] Complexity requirements
- [ ] Password history
- [ ] Password reset tokens

### R. Performance & Scalability
- [x] Pagination implementada
- [ ] Database query optimization
- [ ] Caching strategies
- [ ] Connection pooling

### S. Testing
- [ ] Security unit tests
- [ ] E2E security tests
- [ ] Penetration tests

## Vulnerabilidades Encontradas e Corrigidas

### ✅ SEC-001 - GET /professionals/:id sem ownership check
**Status**: FIXED (2026-10-15)
**Impacto**: Médio — Usuário pode acessar dados de qualquer profissional
**Descrição**: O endpoint GET /professionals/:id era protegido por JWT, mas aceitava qualquer `:id` arbitrário sem verificar se o usuário autenticado é dono dos dados (cross-tenant). Nota: a correção registrada em 2026-09-16 havia sido revertida como colateral do R3 — o finding permaneceu real até esta correção.
**Correção**: `findOneByIdForOwner(id, professionalId)` no service — o `professionalId` confiável vem exclusivamente de `req.user` (JWT); o `:id` da URL só é aceito quando pertence ao usuário autenticado. `ensureProfessionalId()` segue o padrão do módulo services.
**Comportamento final**:
- GET /professionals/:id continua protegido por JWT
- Professional só acessa o próprio professionalId
- Cross-tenant retorna 404 (anti-enumeração, consistente com o módulo services)
- Ausência de professionalId autenticado retorna 403
- Rotas públicas (`GET /professionals`, `GET /professionals/slug/:slug`) permanecem intactas
- Nenhum bypass ADMIN implementado ainda
**Arquivos**:
- `backend/src/professionals/professionals.service.ts`
- `backend/src/professionals/professionals.controller.ts`
- `backend/src/professionals/professionals-ownership.spec.ts` (novo)
**Evidence**: commit `cd0cd21` — 34/34 testes focados passando (5 suítes de `src/professionals`), `npm run build` limpo
**Commit**: `cd0cd21` — `fix(professionals): enforce ownership on private lookup`

### ✅ SEC-002 - Rate Limiting
**Status**: FIXED
**Impacto**: Alto — Endpoint de login/register vulnerável a brute-force
**Descrição**: Endpoints de autenticação sem rate limiting, permitindo múltiplas tentativas
**Correção**: Registrado `ThrottlerGuard` global via `APP_GUARD` em `app.module.ts`. ThrottlerModule.forRoot() configurado com limites padrão + decorators específicos por rota.
**Arquivos**:
- `backend/src/app.module.ts` (ThrottlerModule.forRoot + APP_GUARD provider)
- `backend/src/auth/auth.controller.ts` (decorators @Throttle: register 5/hora, login 10/min)
- `backend/src/appointments/appointments.controller.ts` (30 req/min controller-level)
- `backend/src/throttler.guard.spec.ts` (4 testes HTTP 429 passing)
**Problema anterior**: `ThrottlerModule.forRoot()` configura providers mas NÃO registra `ThrottlerGuard` automaticamente. Sem `APP_GUARD`, decorators `@Throttle` são metadata sem efeito.
**Solução**: `{ provide: APP_GUARD, useClass: ThrottlerGuard }` no providers de `AppModule`.
**Limites configurados**:
| Rota | Limite | TTL |
|---|---|---|
| Global (padrão) | 100 req | 60s |
| POST /auth/login | 10 req | 60s |
| GET /appointments (controller) | 30 req | 60s |
**Evidence**: 4/4 testes passando (200 dentro do limite, 429 excedendo), typecheck clean
**Commit**: `security: fix SEC-002 — ThrottlerGuard via APP_GUARD`

### ✅ SEC-003 - findByPhone sem pagination
**Status**: FIXED — DTO com `@Type(() => Number)`, `@IsInt()`, `@Min()`, `@Max()` + `professionalId` opcional (2026-09-18)
**Impacto**: Médio — Retornava todos os agendamentos sem limite
**Descrição**: O método `findByPhone()` retornava todos os registros sem paginação
**Correção**: Adicionado `FindByPhoneQueryDto` com validação estrita:
- `professionalId` opcional (`@IsString()` — não concede autorização)
- `limit` opcional (`@Type(() => Number)` + `@IsInt()` + `@Min(1)` + `@Max(100)`)
- `offset` opcional (`@Type(() => Number)` + `@IsInt()` + `@Min(0)`)
- `@Type(() => Number)` rejeita strings como `"10abc"`, `"1.5"`, `"50.9"`
- `whitelist: true` + `forbidNonWhitelisted: true` aplicados ao DTO raiz
**Arquivos**:
- `backend/src/appointments/dto/find-by-phone-query.dto.ts` (novo — 3 campos)
- `backend/src/appointments/find-by-phone-query.dto.spec.ts` (novo — 20 testes)
- `backend/src/appointments/appointments.controller.ts` (Query DTO completo, profissionalId opcional)
- `backend/src/appointments/appointments.service.ts` (take/skip com `??` defaults)
**Testes**: 20/20 DTO + 4/4 service
- `{}` → ✅ OK
- `{ limit: "10" }` → ✅ `{ limit: 10 }` (typeof === 'number')
- `{ limit: "100" }` → ✅ OK
- `{ limit: "101" }` → ❌ 400
- `{ limit: "10abc" }` → ❌ 400 (rejeitado por @IsInt)
- `{ limit: "1.5" }` → ❌ 400
- `{ limit: "50.9" }` → ❌ 400
- `{ offset: "20" }` → ✅ OK
- `{ offset: "-1" }` → ❌ 400
- `{ campoExtra: "x" }` → ❌ 400 (forbidNonWhitelisted)
- `{ professionalId: "abc" }` → ✅ OK
- `{ professionalId: "abc", limit: "50", offset: "20" }` → ✅ OK
**Comportamento de take/skip**:
- `limit` undefined → `take = 50` (default)
- `offset` undefined → `skip = 0` (default)
- `professionalId` undefined → sem filtro por professional (via spread operator)
**Rota**: `GET /appointments/by-phone?phone=...&professionalId=...&limit=...&offset=...`
**professionalId**: continua opcional — não altera contrato existente

### ✅ SEC-004 - themeColors sem validação estrutural
**Status**: FIXED — Validado com ValidationPipe REAL + metatype (2026-09-17)
**Impacto**: Baixo — Dados inconsistentes podiam ser salvos
**Descrição**: Campo `themeColors` aceitava qualquer tipo de dado, sem validação estrutural
**Correção inicial (2026-09-16)**: Criado `ThemeColorsDto` com `@IsOptional() @IsString()`, adicionado `@ValidateNested()`, `@Type()`, `@Transform()`
**Problema da correção inicial**: `@Transform` retornava `{ ...value }` transformando ThemeColorsDto em plain object. Com `whitelist: true` do ValidationPipe global, `primary` era removido do nested ANTES do `@ValidateNested` validar → 400 falso.
**Correção final (2026-09-17)**:
- Removido `@Transform` de `update-professional-profile.dto.ts`
- Substituído por `@IsObject() @ValidateNested() @Type(() => ThemeColorsDto)`
- `themeColors` tipado como `ThemeColorsDto | null`
- Service converte para plain object com spread `{ ...dto.themeColors }` antes de enviar ao Prisma
- `ThemeColorsDto` sem `@Expose()` (não necessário — whitelist funciona corretamente com nested)
**Arquivos**:
- `backend/src/professionals/dto/theme-colors.dto.ts` (novo)
- `backend/src/professionals/dto/update-professional-profile.dto.ts` (corrigido)
- `backend/src/professionals/professionals.service.ts` (plain object para Prisma)
**Testes**: 9/9 passando com ValidationPipe REAL + metatype
- `{}` → ✅ OK
- themeColors ausente → ✅ undefined
- `{ primary }` → ✅ OK, instanceof ThemeColorsDto === true
- `{ primary, secondary, accent }` → ✅ OK
- `{ primary: 123 }` → ❌ 400 (IsString)
- `"texto"` → ❌ 400 (IsObject)
- `[]` → ❌ 400 (IsObject)
- `{ primary, campoExtra }` → ❌ 400 (forbidNonWhitelisted)
- `null` → ✅ null (não atualizar)
**Nested DTO é ThemeColorsDto real**: `instanceof ThemeColorsDto` retorna `true`
**Campos extras retornam 400**: `forbidNonWhitelisted` aplicada corretamente
**Tipos inválidos retornam 400**: `IsString` valida em nested com whitelist
**String/array retornam 400**: `@IsObject()` no themeColors
**null mantém "não atualizar"**: `null` é falsy → service não inclui no Prisma

## Status Detalhado das Vulnerabilidades

| ID | Descrição | Status | Impacto | Corrigido |
|---|---|---|---|---|
| SEC-001 | GET /professionals/:id sem ownership check | ✅ FIXED (cd0cd21) | Médio | Sim |
| SEC-002 | Rate limiting ausente | ✅ FIXED | Alto | Sim |
| SEC-003 | findByPhone sem pagination | ✅ FIXED | Médio | Sim |
| SEC-004 | themeColors sem validação | ✅ FIXED + VERIFIED | Baixo | Sim |
| SEC-005 | GET /services/professional/:professionalId sem guard | ✅ INTENTIONAL_PUBLIC | Baixo | Não |
| SEC-006 | GET /professionals sem limit | ✅ FIXED | Médio | Sim |
| SEC-007 | GET /professionals/slug/:slug expõe email | 🔇 OBSOLETE | Baixo | Não |

## Próximos itens (ordenados por impacto)

**PRÓXIMO ITEM**

1. [x] **R3** — GET /professionals sem paginação
   - Rota pública sem limit/offset
   - Status: FIXED
   - Evidências:
     - DTO implementado com @Type(() => Number), @IsInt, @Min(1), @Max(100), @Min(0)
     - Paginação implementada: take, skip, orderBy: { slug: 'asc' }
     - 10/10 testes DTO passando (ValidationPipe isolado)
     - 6/6 testes service passando (Prisma mockado)
     - TypeCheck clean (tsc --noEmit)
     - Arquivos de R3 sem erros de lint; lint global possui erros preexistentes (63+ erros em 12 arquivos pré-existentes, nenhum em R3)
     - E2E não executado (AppModule importa PrismaModule → banco real)
   - Arquivos: dto/find-professionals.dto.ts, find-professionals.dto.spec.ts, professionals.service.spec.ts, controller, service
   - Evidência/limitação: E2E pendente por segurança do banco — não impede FIXED
   - Colateral revertido: findOneById ownership check (SEC-001 já trata)

2. [POST_DEPLOY] **R2** — GET /appointments sem LIMIT (dashboard)
   - findByProfessional() sem take/skip
   - Dashboard calcula TODOS os filtros/contagens no client
   - take=50 quebraria semântica de contagens/histórico
   - Decisão consciente: POST_DEPLOY
   - Monitorar crescimento e implementar paginação/filtros server-side quando o volume justificar

3. [INTENTIONAL_PUBLIC] **SEC-005** — `GET /services/professional/:professionalId` sem guard
   - Rota pública necessária para página /professional/[slug]
   - Retorna SOMENTE serviços com isActive = true
   - Campos: id, name, description, durationMinutes, price, isActive
   - Não expõe email, password, ou dados privados do User
   - Consumidor: frontend/app/professional/[slug]/page.tsx

4. [✅ FIXED] **SEC-006** — `GET /professionals` sem limit
   - Status: FIXED (commit fa6cc2d, 2026-09-18)
   - DTO FindProfessionalsDto: @Type(() => Number) + @IsInt() + @Min(1) + @Max(100) + @Min(0)
   - Service: take = limit ?? 20, skip = offset ?? 0
   - 10/10 testes DTO + 6/6 service passing
   - Arquivos: dto/find-professionals.dto.ts, find-professionals.dto.spec.ts, controller, service

5. [🔇 OBSOLETE] **SEC-007** — `GET /professionals/slug/:slug` retorna user com email
   - Status: OBSOLETE (finding não reprodutível)
   - `findOneBySlug()` no commit original `2cb2695` já não incluía relation User
   - Nenhum commit posterior alterou o include de findOneBySlug
   - O finding antigo foi baseado em suposição de que a rota expunha email
   - Retornam apenas: name, bio, avatarUrl, instagram, facebook, whatsapp, themeColors

6. [POST_DEPLOY] **R3** — `findAll()` sem consumidor
   - Método existe no service mas não tem rota HTTP
   - Código legado/interno
   - Pode ser removido ou preservado para futuro painel admin

7. [ ] **POST /professionals** removido (não exposto)
   - ProfissionaisService.create preservado para onboarding futuro
   - CreateProfessionalDto preservado

8. [ ] **POST /auth/register** removido (não exposto)
   - AuthService.register preservado para onboarding futuro
   - RegisterDto preservado com @MinLength(8)
   - Clientes sem conta para agendamentos no MVP

## Regras de Workflow

1. **UM vulnerability por fix** — Commits atômicos
2. **Atualizar SECURITY-AUDIT.md ANTES do commit**
3. **Message format**: `security: fix SEC-XXX — <descrição>`
4. **NÃO executar**: `git add .`, `git reset --hard`, `git push --force`
5. **Validar**: `npx tsc --noEmit` após cada mudança

## Operações Proibidas
- `git add .` (usar paths específicos)
- `git reset --hard`
- `git push --force`

## Segurança de Ferramentas Externas
- GitHub search: keyword + semantic matching
- Context7: biblioteca/documentação atualizada
- MCP servers: isolated contexts por task

## Plano de Teste E2E

### SEC-001 - Ownership Check
```
Given: Professional A e B existem
When: User A acessa GET /professionals/:id (ID de B)
Then: Retorna 404 Not Found (cross-tenant, anti-enumeração)
When: User A acessa GET /professionals/:id (seu próprio ID)
Then: Retorna 200 OK com dados corretos
When: User sem professionalId acessa GET /professionals/:id
Then: Retorna 403 Forbidden
```

### SEC-002 - Rate Limiting
```
Given: Throttler configurado
When: 100 requests/mensagem (global)
Then: 101º request retorna 429 Too Many Requests
When: 5 requests/register (5/hora)
Then: 6º request retorna 429
When: 10 requests/login (10/min)
Then: 11º request retorna 429
```

### SEC-003 - Pagination
```
Given: 50 agendamentos no banco
When: GET /appointments/by-phone?phone=123
Then: Retorna no máximo 100 resultados
When: GET /appointments/by-phone?phone=123&limit=10&offset=0
Then: Retorna 10 resultados com headers de paginação
When: GET /appointments/by-phone?phone=123&professionalId=xxx
Then: Retorna agendamentos do profissional xxx
```

### SEC-004 - themeColors Validation
```
Given: DTO de update profissional
When: Envio de themeColors com valores válidos
Then: Aceita e salva corretamente
When: Envio de themeColors sem formato de objeto
Then: Retorna 400 Bad Request
```

### SEC-004 - Testes Executados (2026-09-17)

**Cenários validados (14/14 passing):**

| Input | Resultado | Motivo |
|---|---|---|
| `{ primary, secondary, accent }` válidos | ✅ Aceita | Todos string |
| `{ primary }` válido | ✅ Aceita | Campos @IsOptional |
| `{}` vazio | ✅ Aceita | Todos @IsOptional |
| `{ primary: 123 }` number | ✅ Aceita | @IsString não valida em nested sem whitelist |
| `{ primary: "#fff", campoExtra: "x" }` | ✅ Aceita | Whitelist não aplica em nested por padrão |
| `null` | ✅ Aceita | @Transform: null → undefined (falsy) |
| `undefined` (ausente) | ✅ Aceita | @IsOptional |
| `[]` array | ❌ 400 | @Transform lança BadRequestException |
| `"texto"` string | ✅ Aceita | @Transform: string → `{ ...value }` = {} |

**Comportamento real do ValidationPipe:**
- Whitelist/forbidNonWhitelisted aplica ao DTO RAIZ, não ao nested
- `@ValidateNested` sem `whitelist: true` no nested → campos extra NÃO são removidos
- `@IsString()` com `@IsOptional()` aceita number (sem whitelist em nested)
- `@Transform` para array lança BadRequestException (único caso rejeitado)
- `@Transform` para string converte para objeto vazio (permissivo)
- `@Transform` para null → undefined (não grava no Prisma)

**Risco residual:**
- `themeColors: { primary: 123 }` → 123 salvo no banco JSON
- `themeColors: "string"` → `{}` salvo no banco JSON
- `themeColors: { primary: "#fff", extra: true }` → campo extra persiste
- Correção suficiente: previne array, null, e tipos óbvios
- Para validação estrita: adicionar `whitelist: true` ao ThemeColorsDto ou usar `@IsNotEmptyObject()`

## Changelog

### 2026-10-30 - Frontend: UX de gerenciamento de agendamentos (commit 58787cb)
- Backend response authority no frontend: após PATCH sucesso o item é substituído pelo `response.data` — zero optimistic status; o backend continua decidindo se a transição é válida (o timing do frontend é apenas visual)
- Allowlist de mensagens de erro: o frontend NÃO reflete qualquer mensagem arbitrária do backend — somente as mensagens conhecidas do contrato (transição inválida, horário ainda não ocorreu, cancelamento após horário, motivo obrigatório, não encontrado, concorrência); mensagem desconhecida → fallback seguro
- 404/409 → feedback + refetch `GET /appointments` — stale state não é mantido; 401 permanece no interceptor; 403 comum → feedback seguro sem logout local (suspended/archived continuam no interceptor exato)
- Double-submit guard síncrono `useRef<Set<string>>` por appointment id (ou cleanup) — 2 cliques → 1 request; guard liberado em todos os status permitindo retry
- Motivo de cancelamento: obrigatório, trim, maxLength 500, whitespace-only inválido, isolado por appointment (não vaza entre diálogos); zero window.confirm/window.alert/prompt() na área de appointments
- Commit local — ainda NÃO pushado; Vercel ainda NÃO validado; production smoke deste frontend ainda NÃO executado

### 2026-10-29 - Backend: hardening da state machine de status pelo Professional (commit 45526f9)
- Tenant boundary server-side mantido: `professionalId` vem SOMENTE da sessão/JWT — nunca controlável pelo body; cross-tenant → 404 (sem existence leak); ADMIN sem Professional permanece 400 "Profissional não identificado."
- CAS anti lost-update: `updateMany` condicional com `id` + `professionalId` + status anterior lido do banco; count=0 → re-check por id+professionalId; operação stale → 409 "O agendamento foi alterado por outra operação. Atualize e tente novamente."; sem segunda write em corrida
- Metadata de cancelamento atômica: status + cancelledBy + cancellationReason + cancelledAt na MESMA write — corrida não deixa metadata parcial
- Response authority: leitura final pós-CAS é a autoridade; quality review corrigiu null silencioso na leitura final (delete físico concorrente) → 404 "Agendamento não encontrado."
- Same-state e transições inválidas → 400 com zero write; timing server-side: COMPLETED/NO_SHOW somente com `date <= now` (boundary equality = já ocorreu), CANCELLED somente antes do horário
- `cancel-public` e `UpdateAppointmentStatusDto` preservados — nenhum endpoint novo, nenhum novo enum, nenhuma migration
- Testes: suíte nova `appointments-status-transition.spec.ts` 38/38; backend 298/298 (22 suítes); build PASS; prisma validate PASS. Commit local — ainda NÃO pushado; deploy ainda NÃO validado

### 2026-10-28 - Fechamento de produção: frontend de arquivamento (Vercel) — safe smoke PASS
- `?reason=archived` validado em produção com a mensagem exata; query arbitrária não refletida no DOM (mapeamento fixo); `reason=suspended` sem regressão
- Ação de archive exige confirmação via AlertDialog obrigatório; Cancelar não dispara nenhum write (zero DELETE, zero PATCH, zero toast); diálogo reabre normalmente após cancelamento
- Ação de archive não existe na listagem (somente edit page) — reduz risco de ação acidental
- Nenhum Professional real foi usado para write no smoke: DELETE real = 0, PATCH = 0; estado final TOTAL=1, ARCHIVED_COUNT=0; Professional real ACTIVE, `deletedAt = null`
- Motivos administrativos não vazam publicamente (archived → 404/not-found atual)
- Logout final das sessões utilizado com localStorage vazio; nenhuma credencial impressa
- Cenários reais (archive, archived session redirect, direct archived login) permanecem cobertos pelos testes automatizados: frontend 159/159 (9 suítes), backend 260/260 (21 suítes), build PASS

### 2026-10-27 - Frontend: UX de Professional arquivado (commit 1e3c913)
- Match EXATO da mensagem archived (`===`, sem includes/regex) em `lib/suspension.ts`; match de suspended preservado; mensagem parecida mas não exata NÃO dispara logout
- 403 comum NÃO causa logout (booking/RBAC ADMIN continuam inline); 401 preservado; `POST /auth/login` excluído do logout para suspended E archived (direct login trata inline — sem loop)
- Query arbitrária nunca refletida na UI (mapeamento fixo: somente `suspended`/`archived` → texto fixo frontend)
- Redirect dedupe compartilhado: flag única `accountStateRedirectInProgress` — suspended e archived entre si produzem um único redirect; segundo erro não sobrescreve destino
- Double-submit guard síncrono (`archivingRef`) — 2 cliques → 1 DELETE; `DELETE` enviado com zero body; confirmação via AlertDialog obrigatório antes do request
- Público archived continua 404/not-found atual — frontend não revela o motivo (coerente com a decisão backend)
- Testes frontend 159/159 (9 suítes; api-interceptor 25/25; focados 132/132); `npm run build` PASS; backend permanece 260/260
- Commit local ainda NÃO pushado; Vercel ainda NÃO validado; Professional real NÃO arquivado

### 2026-10-26 - Backend: arquivamento lógico de Professional — soft delete (commit b2f6377)
- Hard delete evitado — remoção operacional via `Professional.deletedAt` (lifecycle; `ProfessionalStatus` permanece ACTIVE/SUSPENDED); histórico preservado (User/Services/Availability/Periods/Exceptions/Appointments intactos — nenhum cancelamento automático); migration `20261026000000_add_professional_deleted_at` aditiva, versionada, **ainda NÃO aplicada em produção**
- Login valida a senha antes de revelar o arquivamento (senha errada em User arquivado → 401 genérico — sem enumeração de estado); senha correta + arquivado → 403 com mensagem própria; **archive tem prioridade sobre a suspensão**
- JWT antigo bloqueado: JwtStrategy consulta o banco em cada request — arquivado perde acesso às áreas privadas na próxima request (sem blacklist); ADMIN nunca é bloqueado
- Arquivado oculto das listagens admin/pública (list/count/search filtram `deletedAt: null`); GET/edição/status de arquivado → 404; slug público → 404 (slug/email continuam reservados pelo unique); services/availability públicos de arquivado → `[]`; novo booking bloqueado server-side (403, zero Appointment criado); by-phone/cancel-public de appointments existentes intactos
- **Leak `deletedAt` corrigido no quality review**: as responses públicas (findAll/findOneById/findOneBySlug) retornavam o model completo e exporiam o campo — removido antes da response; testes dedicados garantem a ausência
- Race safety: edição/status escrevem com condição `deletedAt: null` (archive concorrente → P2025 → 409); P2025 do archive passa por re-check antes da resposta (arquivado → 204 · inexistente → 404 — nunca 204 cego); `deletedAt` escrevível somente pelo archive (create rejeita o campo)
- `ARCHIVED_SESSION_FRONTEND_UX_PENDING=true`: interceptor frontend reconhece somente a mensagem de suspensão — UX de sessão arquivada pendente (backend já bloqueia com 403)
- Testes: focados archive 49/49 (admin 22 · auth 12 · público 15); regressão suspension/edit 83/83; backend 260/260 (21 suítes); build PASS; prisma validate/generate PASS. Commit local, ainda não pushado

### 2026-10-26 - Frontend UX: Professional suspenso (commit e8a1a2d)
- 403 comum NÃO encerra sessão; sessão encerrada somente com match EXATO da mensagem de suspensão (sem includes/regex) — evita falso logout; ADMIN protegido (nunca recebe a mensagem de suspensão)
- `POST /auth/login` excluído do tratamento global do interceptor — a página trata inline; sem loop de redirect (login page não faz request privada no mount)
- Query `?reason=suspended` carrega apenas estado sem dados sensíveis — nunca renderiza conteúdo arbitrário da query (anti-reflexão/injeção)
- Token não é salvo no login de conta suspensa; sessão já ativa suspensa tem token removido centralmente pelo interceptor (sem toast; um único redirect lógico)
- 403 de booking público (mensagem própria) não é confundido com suspensão de sessão — zero falso logout
- Testes: api-interceptor 13/13, login-suspension 9/9, public-profile-suspension 9/9; frontend 117/117 (9 suítes); build PASS. Commit local, ainda não pushado

### 2026-10-25 - Frontend ADMIN: controles de suspensão/reativação (commit ee3a6e2)
- Frontend envia SOMENTE `{ status }` no PATCH — sem mass assignment; backend permanece a autoridade (badge atualiza pelo `status` retornado, sem optimistic UI)
- Erros sem vazamento: 400/5xx/rede → toast seguro sem alterar badge; 403 → acesso negado sem logout manual; 404 → toast + refetch preservando busca/página; 401 → interceptor existente (sem duplicar lógica)
- Ação degradante (Suspender) exige confirmação via AlertDialog; Reativar é direta (reversível); Cancelar no diálogo gera zero PATCH
- Componente `components/ui/alert-dialog.tsx` adicionado via `radix-ui` já instalado — nenhuma dependency npm nova
- Testes: suíte da listagem 32/32 (payload exato, autoridade da response, pending por id, duplo clique, erros); frontend 89/89; build PASS. Commit local, ainda não pushado

### 2026-10-23 - Controles de segurança: suspensão de profissionais (commit 78bd46e)
- JWT antigo não ignora suspensão: o estado é verificado no banco em cada request autenticada (JwtStrategy já consulta User+Professional); sem blacklist de tokens
- Login valida a senha antes de revelar o estado da conta (senha errada em conta suspensa → 401 genérico — sem enumeração)
- Backend é a autoridade de novo booking para Professional suspenso (POST /appointments → 403; available → vazio)
- `status` não é mass-assignment no PATCH de edição (DTO separado; `forbidNonWhitelisted` → 400)
- Auth/autorização do ADMIN permanece separada — ADMIN nunca é bloqueado pelo estado de suspensão
- Testes: 47 cenários novos (admin status 23 · auth 11 · booking/público 13); backend 211/211 (18 suítes); migration `20261023000000_add_professional_status` versionada, ainda não aplicada em produção

### 2026-10-15 - SEC-001 corrigido de fato (commit cd0cd21)
- [x] SEC-001: Ownership check em GET /professionals/:id — FIXED
  - A correção de 2026-09-16 havia sido revertida como colateral do R3 (ver nota no item 1 de "Próximos itens") — o finding estava real no pré-fix
  - `findOneByIdForOwner()` com `professionalId` exclusivo de `req.user` (JWT); cross-tenant → 404; sem professionalId → 403
  - Evidência: 34/34 testes focados (5 suítes), build limpo, spec novo `professionals-ownership.spec.ts`
  - Sem bypass ADMIN (painel ADMIN é tarefa posterior)

### 2026-09-16 - Auditoria Inicial
- [x] SEC-001: Ownership check implementado ✅ (revertido como colateral do R3 — corrigido de fato em 2026-10-15, cd0cd21)
- [x] SEC-002: Rate limiting configurado ✅
- [x] SEC-003: Pagination em findByPhone ✅
- [x] SEC-004: Validacao estrutural themeColors ✅
- [ ] R2/R3: Pagination em findAll (em progresso)

### Executive Summary

**Projeto**: PEX Agendamento (MVP Fase 1)
**Stack**: NestJS 11 + Next.js 16 + Prisma 6 + PostgreSQL
**Data**: 2026-09-16

**Resultados da Auditoria**:
- 4 vulnerabilidades identificadas e corrigidas
- 0 vulnerabilidades pendentes em alto impacto
- 9 arquivos modificados, +82/-19 linhas
- ✅ Compilação TypeScript: limpa (0 erros)

**Prioridade Alta**:
- SEC-002: Rate limiting em endpoints de autenticação (brute-force protection)

**Prioridade Média**:
- SEC-001: Ownership check em endpoints de consulta
- SEC-003: Pagination em consultas de listagem

**Prioridade Baixa**:
- SEC-004: Validação estrutural de campos JSON

**Próximos Passos**:
1. Implementar R2/R3 (pagination em findAll)
2. Adicionar guard em GET /services/professional/:id
3. Implementar paginação em GET /professionals
4. Avaliar exposição de email em endpoint público

---
*Documento atualizado: 2026-09-16*
*Próxima auditoria recomendada: Após deploy da Fase 2 (SaaS multi-tenant)*
