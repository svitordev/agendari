# CHANGELOG

## 2026-10-28 — Fechamento de produção: frontend de arquivamento deployado + safe smoke PASS

- **Publicados**: `1e3c913` (feat) + `a53319c` (docs) pushados para origin/main e deployados no Vercel — validados em produção
- **Safe smoke (PASS, sem archive real)**: `?reason=archived` com mensagem exata; query arbitrária não refletida; `reason=suspended` regressão PASS; login/dashboard/perfil público do Professional ACTIVE PASS; ADMIN login/listagem/edit page/zona de perigo/AlertDialog/botão destructive PASS; Cancelar fecha o diálogo com zero DELETE, zero PATCH, zero toast de sucesso; diálogo reabre normalmente
- **Zero writes** (deliberadamente não destrutivo): archive DELETE real = 0; status writes = 0; Appointment creates = 0; Professional creates = 0
- **Estado final do banco**: TOTAL Professionals = 1; ARCHIVED_COUNT = 0; Professional real (jessicasantana) ACTIVE, `deletedAt = null` — nenhum Professional real foi arquivado para o smoke
- **Não executados em produção** (cobertos pelos testes automatizados): archive real, archived session redirect, direct archived login — não arquivar o único Professional real apenas para smoke
- **CRUD ADMIN**: CONCLUÍDO EM PRODUÇÃO (listagem, criação, edição, suspensão, reativação, arquivamento lógico, frontend archive, auth/archive UX, produção validada). Restore, filtro/tela de arquivados, hard purge, política de retenção, audit log dedicado e deletedBy/reason são backlog futuro separado

## 2026-10-27 — Frontend ADMIN: arquivamento de Professional — UX archived (commit 1e3c913)

- **Commit**: `1e3c913` — `feat(admin): add professional archive frontend` (commit local — ainda NÃO pushado; Vercel ainda NÃO validado; Professional real NÃO arquivado)
- **Escopo**: somente frontend — nenhum arquivo de backend/Prisma/migration alterado; nenhuma dependency npm nova (`components/ui/alert-dialog.tsx` já existente reutilizado)
- **Ação**: botão "Arquivar profissional" (variant destructive) SOMENTE na edit page `/admin/professionals/[id]/edit`, em seção separada de perigo no final da página — a listagem NÃO tem botão archive (reduz risco de ação acidental); visível inclusive com user=null (archive não depende de User)
- **Confirmação**: AlertDialog obrigatório — título "Arquivar profissional?"; descrição: perfil deixa de aparecer publicamente, login bloqueado, novos agendamentos bloqueados, dados/histórico preservados, "Agendamentos existentes serão preservados.", sem restauração pela interface nesta versão; botões Cancelar + "Arquivar profissional"; sem digitação de slug/nome
- **Request**: `DELETE /admin/professionals/:id` com ZERO body (sem deletedAt/status/reason/payload vazio) — `api.delete(url)` com um único argumento (provado por teste)
- **Loading/race**: estado dedicado `isArchiving` + guard síncrono `archivingRef` (o Radix dispara close no clique da ação — a ref mantém o pending "Arquivando..." visível e bloqueia double submit); Cancelar/confirm protegidos durante pending; erro permite retry
- **Respostas**: 204 (inclusive idempotente) → toast "Profissional arquivado com sucesso." + redirect `/admin/professionals`; 404 → toast "Profissional não encontrado." + redirect (sem página stale); 403 comum → erro seguro inline sem logout; 401 → interceptor existente (não duplicado); 5xx/rede → página permanece, loading resetado, erro seguro, retry
- **Constants** (`lib/suspension.ts` — fonte única de account-state): `ARCHIVED_ACCOUNT_MESSAGE` (espelho exato do backend), `ARCHIVED_REASON`, `ARCHIVED_LOGIN_PATH`, `isArchivedAccountError` — match EXATO, sem includes/regex
- **Interceptor**: flag única compartilhada `accountStateRedirectInProgress` (suspended + archived deduplicam entre si — segundo erro não sobrescreve destino); `POST /auth/login` excluído para ambos (direct login trata inline); 401 preservado; 403 comum/booking/RBAC sem logout; helper test-only renomeado `__resetAccountStateRedirectForTest`
- **Login**: direct archived → mensagem inline `role="alert"`, zero token salvo, zero redirect dashboard; `?reason=archived` → texto fixo frontend (query arbitrária nunca refletida); suspended preservado
- **Público**: archived → 404 → UX not-found atual ("Profissional não encontrado.") — não revela archive/desativação/motivo; ACTIVE/SUSPENDED preservados
- **Types**: sem `ARCHIVED` no `ProfessionalStatus`; sem `deletedAt` nos types frontend — archive continua lifecycle backend
- **Testes**: frontend **159/159** (9 suítes); api-interceptor 25/25; interceptor+login 42/42; interceptor+login+edit 86/86; ordem inversa 86/86; focados 132/132; `npm run build` PASS; backend permanece 260/260 (21 suítes)
- **Quality review**: 5 fragilidades LOW apenas em testes, corrigidas (user=null fluxo completo; Cancelar prova zero redirect; double-click com race síncrona real; sucesso prova ausência de segunda request; cross-state na ordem inversa); nenhuma correção de production code foi necessária
- **Pendências**: push do commit; deploy Vercel + production smoke frontend; restore; filtro archived; purge

## 2026-10-26 — Backend ADMIN: arquivamento lógico de Professional — soft delete (commit b2f6377)

- **Decisão arquitetural**: NÃO existe hard delete de Professional — a remoção operacional é soft delete via `Professional.deletedAt DateTime?` (lifecycle); `ProfessionalStatus` permanece ACTIVE/SUSPENDED (estado operacional); sem `ARCHIVED` no enum; sem `deletedBy`/`deletionReason`/`isDeleted`
- **Motivo**: hard delete não é seguro — Appointment→Professional é Restrict e AvailabilityException→Professional não tem onDelete (Restrict), e as demais relações geram cascade de User/Services/Availability; archive preserva os dados e evita perda histórica
- **Migration**: `20261026000000_add_professional_deleted_at` — aditiva (`ADD COLUMN "deletedAt" TIMESTAMP(3)` nullable, sem default); registros existentes permanecem `deletedAt = null`; sem UPDATE/DELETE/DROP; nenhuma FK alterada; não destrutiva; **versionada, ainda NÃO aplicada em produção**
- **Nova rota**: `DELETE /admin/professionals/:id` — `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)`; sem body, sem DTO; sucesso → 204; inexistente → 404 "Profissional não encontrado."; já arquivado → 204 com ZERO escrita (deletedAt anterior preservado — idempotente); nenhum `prisma.professional.delete`/`deleteMany`
- **P2025/concorrência**: update condicional `where { id, deletedAt: null }`; P2025 sozinho não distingue archive concorrente de remoção física → re-check: arquivado → 204; inexistente → 404 (nunca 204 cego)
- **Dados preservados**: archive não deleta User, não cancela/apaga Appointments (futuros e históricos), não deleta Services/Availability/Periods/Exceptions; nenhum cancelamento automático; Professional com `user=null` pode ser arquivado normalmente (nenhum User criado)
- **ADMIN**: listagem/count/search filtram `deletedAt: null` (archived não escapa pelo OR); paginação preservada; GET/edição/status de arquivado → 404; mudança de status NÃO restaura archived (restore é feature futura); status no-op normal continua sem escrita; create não aceita `deletedAt` controlável
- **Race safety**: edição e status escrevem com condição `deletedAt: null` — archive entre pre-check e escrita → update não casa (P2025 → 409); nenhum update posterior altera arquivado
- **Auth**: senha validada ANTES de revelar o arquivamento (senha errada → 401 genérico — sem enumeração); senha correta + arquivado → 403 "Este perfil foi desativado. Entre em contato com o administrador."; **archive tem prioridade sobre SUSPENDED**; JwtStrategy bloqueia JWT antigo de arquivado na próxima request privada; ADMIN nunca bloqueado
- **Público**: listagem exclui arquivado; slug de arquivado → 404 (slug/email continuam reservados pelo unique — sem reutilização automática, sem 410/tombstone); services públicos de arquivado → `[]`; availability pública → `[]`; booking POST → 403 com mensagem própria e zero Appointment criado; available → `{ available: false, slots: [], message }`; by-phone e cancel-public de appointments existentes intactos
- **Leak `deletedAt` (quality review)**: `findAll`/`findOneById`/`findOneBySlug` retornavam o model Prisma completo e exporiam `deletedAt` — campo removido das responses públicas; testes dedicados garantem a ausência
- **Testes**: `admin-archive-professional.spec.ts` (22) + `auth-archived.spec.ts` (12) + `appointments-archived.spec.ts` (15); focados archive 49/49; regressão suspension/edit 83/83; backend total **260/260** (21 suítes); `npm run build` PASS; `prisma validate`/`generate` PASS
- **Frontend**: inalterado (117/117, 9 suítes) — `ARCHIVED_SESSION_FRONTEND_UX_PENDING=true` (interceptor só reconhece a mensagem de suspensão; UX de sessão arquivada é a próxima etapa)
- **Commit**: `b2f6377` — `feat(admin): add professional archive` (commit local — ainda não pushado)

## 2026-10-26 — Frontend UX: Professional suspenso (commit e8a1a2d)

- **Contexto**: backend de suspensão já publicado (78bd46e) e listagem ADMIN com badge/ações concluída (ee3a6e2) — este commit é somente a UX frontend de suspensão
- **Interceptor (`lib/api.ts`)**: 403 + mensagem EXATA "Conta suspensa. Entre em contato com o administrador." em request privada → remove token + redirect `/login?reason=suspended`; sem toast; flag module-level garante um único redirect lógico para múltiplos 403 simultâneos (reload completo reseta naturalmente)
- **`POST /auth/login` é exceção**: o 403 do próprio login não passa pelo redirect global — a página trata inline (sem loop, sem perda de UX)
- **Match exato**: sem includes/regex; 403 comum não encerra sessão; ADMIN nunca tratado como suspenso; 401 preservado
- **Login**: conta suspensa → mensagem inline `role="alert"`, token não salvo, sem redirect; `?reason=suspended` vira texto fixo frontend (query arbitrária não é refletida); `useSearchParams` sob `<Suspense>`; reativação = novo login normal (sem polling/auto-login)
- **Perfil público**: SUSPENDED continua visível (nome/bio/serviços/redes) com aviso acessível "Este profissional não está aceitando novos agendamentos no momento."; enum técnico nunca como label; sem 404/redirect
- **CTA/booking**: "Confirmar agendamento" disabled + guarda defensiva no handleBooking (zero POST pela UI); `available=false`/`slots=[]` preexistente preservado (available continua autoridade operacional); race 403 de booking mostra mensagem segura sem falso logout
- **Histórico do cliente**: by-phone/cancel-public intocados
- **Tipos**: `ProfessionalStatus` reutilizado; `status` adicionado ao tipo público onde o backend garante presença; sem `any` novo; `lib/suspension.ts` novo (constantes compartilhadas)
- **Testes**: api-interceptor 13/13 · login-suspension 9/9 · public-profile-suspension 9/9; frontend total **117/117** (9 suítes); `npm run build` PASS; nenhuma dependency npm nova
- **Commit**: `e8a1a2d` — `feat(auth): handle professional suspension UX` (commit local — ainda não pushado)

## 2026-10-25 — Frontend ADMIN: controles de suspensão/reativação (commit ee3a6e2)

- **Contexto**: migration `20261023000000_add_professional_status` aplicada em produção (Prisma up to date) e backend `78bd46e` publicado + safe smoke PASS — este commit é somente frontend
- **Coluna Status** na listagem `/admin/professionals`: badge com texto — ACTIVE → "Ativo", SUSPENDED → "Suspenso" (o enum técnico nunca é exibido como label; cor é apenas reforço)
- **Ações por linha**: ACTIVE → Editar + Suspender; SUSPENDED → Editar + Reativar (nunca as duas de status simultaneamente); user=null mantém a ação — status pertence ao Professional
- **Confirmação**: Suspender exige AlertDialog (perde acesso às áreas privadas, novos agendamentos bloqueados, dados e agendamentos existentes preservados, ação reversível); Cancelar fecha com zero PATCH; Reativar é direta (reversível)
- **Payload**: literal `{ status: 'SUSPENDED' }` / `{ status: 'ACTIVE' }` — somente o campo, sem mass assignment
- **Sem optimistic**: badge só muda após 200 usando o `status` retornado pelo backend (backend é a autoridade); update local por id; item que saiu da lista durante o request não é reinserido; sem GET extra no sucesso; busca/página preservadas
- **Pending por id**: `pendingIds` com Set imutável — só a linha afetada bloqueia ("Suspendendo..."/"Reativando...", Editar da linha indisponível); duplo clique protegido; linhas independentes
- **Erros**: 400/5xx/rede → toast seguro, badge anterior preservado; 403 → acesso negado sem logout manual; 404 → toast + refetch preservando busca/página; 401 → interceptor existente
- **Componente novo**: `components/ui/alert-dialog.tsx` (shadcn via `radix-ui` já instalado) — nenhuma dependency npm nova
- **Testes**: `tests/admin-professionals.test.tsx` 32/32 (badge, ações, diálogo, payload exato, pending A/B, duplo clique, autoridade da response, non-optimistic, item stale, 404 com busca/página, erros, regressão); frontend total **89/89** (7 suítes); `npm run build` PASS
- **Commit**: `ee3a6e2` — `feat(admin): add professional suspension controls` (commit local — ainda não pushado)

## 2026-10-23 — Backend ADMIN: suspensão/reativação de profissionais (commit 78bd46e)

- **Modelo**: `enum ProfessionalStatus { ACTIVE SUSPENDED }` + `Professional.status @default(ACTIVE)` — fonte única de verdade operacional; nada no User; sem campos de auditoria (suspendedAt/reason) nesta versão
- **Migration**: `20261023000000_add_professional_status` — aditiva (`CREATE TYPE` + `ADD COLUMN NOT NULL DEFAULT 'ACTIVE'`); registros existentes ficam ACTIVE; não destrutiva; **versionada, ainda NÃO aplicada em produção**
- **Nova rota**: `PATCH /admin/professionals/:id/status` — `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)`; DTO separado (`AdminUpdateProfessionalStatusDto`, único campo `status`); o PATCH de edição continua somente com os 5 campos e rejeita `status` (400)
- **Idempotência**: mesmo status → 200 sem escrita (`update` não é chamado; `updatedAt` preservado); mudança real altera somente `Professional.status`; user=null suportado (suspensão é do tenant; nenhum User criado automaticamente)
- **Responses**: listagem/GET individual/criação/edição agora incluem `status` (password continua ausente); novo Professional nasce ACTIVE pelo default do banco (service não envia status controlável)
- **Auth**: JwtStrategy (que já consulta o banco em cada request) bloqueia `Role.PROFESSIONAL` + `SUSPENDED` → 403 "Conta suspensa. Entre em contato com o administrador." — JWT antigo é bloqueado na próxima request (sem blacklist); login valida a senha ANTES de revelar suspensão (senha errada → 401 genérico — sem enumeração); ADMIN nunca bloqueado; reativado → acesso volta
- **Booking**: `POST /appointments` para suspenso → 403 com mensagem segura, zero Appointment criado; `GET /appointments/available` para suspenso → `{ available: false, slots: [] }`; appointments existentes/histórico/Services/Availability intocados; `by-phone` e `cancel-public` continuam funcionando para clientes
- **Perfil público**: continua visível (não vira 404); `GET /professionals` e `GET /professionals/slug/:slug` agora expõem `status` para a UI futura
- **Testes**: `admin-professional-status.spec.ts` (23) + `auth-suspension.spec.ts` (11) + `appointments-suspension.spec.ts` (13); backend total **211/211** (18 suítes); `npm run build` PASS; `prisma validate`/`generate` PASS
- **Frontend**: inalterado (67/67, 7 suítes) — badge, ações Suspender/Reativar, confirmação e UX de suspenso continuam pendentes
- **Commit**: `78bd46e` — `feat(admin): add professional suspension`

## 2026-10-22 — Frontend ADMIN: tela de edição de profissional (commit 714037a)

- **Nova rota**: `/admin/professionals/[id]/edit` — dentro do route group `(protected)`, herda o `AdminRoute` existente; sem guard novo, sem layout novo, sem cliente HTTP paralelo; Client Component com `params: Promise<{ id }>` (padrão Next.js 16 do projeto)
- **Carregamento**: GET `/admin/professionals/:id` inicial preenche o formulário; loading com skeleton (nunca formulário vazio como se fosse dado real); resposta obsoleta do GET descartada por guarda de sequência (seqRef — coberta por teste)
- **Formulário**: exatamente 5 campos editáveis (`name`, `slug`, `email`, `firstName`, `lastName`); password/role/ids/timestamps não são renderizados nem enviados; backend continua autoridade
- **user=null**: aviso "Este profissional não possui usuário associado.", Salvar desabilitado, nenhum PATCH, nenhum User criado automaticamente, nenhum valor fictício
- **Slug**: carregado exatamente como está, sem sugestão automática (mudar o nome não altera o slug); edição manual com aviso "Alterar o slug muda a URL pública do profissional." (sem redirect do slug antigo)
- **Email**: editável com aviso "Alterar o e-mail muda a credencial usada pelo profissional para entrar."; senha não é alterada; sem confirmação por email nesta versão
- **PATCH**: payload objeto explícito com exatamente os 5 campos (sem spread); duplo submit bloqueado (`isSubmitting`, botão "Salvando..."); 200 → toast + retorno à listagem (redirect apenas no sucesso)
- **Erros**: GET 404 → estado dedicado · PATCH 404 → permanece na tela com formulário preenchido · 409 email/slug mapeados por mensagem exata para o campo · 409 user ausente e residual → erro geral · 409 desconhecido → fallback seguro · 403 sem logout · 5xx/rede → mensagem genérica + retry · 401 → interceptor existente
- **Listagem**: ação "Editar" por linha → `/admin/professionals/{id}/edit`
- **Testes**: `tests/admin-edit-professional.test.tsx` (27 novos — Vitest + Testing Library, mocks, zero backend real); suíte da listagem 10; frontend total **67/67** (7 suítes); `npm run build` PASS; rota registrada como dinâmica; nenhuma dependência nova
- **Backend**: inalterado (endpoints de 98f9a46; 164/164, 15 suítes)
- **Commit**: `714037a` — `feat(admin): add professional edit frontend`

## 2026-10-20 — Backend ADMIN: edição administrativa de profissionais (commit 98f9a46)

- **Novas rotas**: `GET /admin/professionals/:id` + `PATCH /admin/professionals/:id` — `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)`; sem JWT → 401 · PROFESSIONAL → 403 · ADMIN → permitido. Somente backend — tela de edição ainda pendente
- **GET individual**: response `{ professional: { id, name, slug, createdAt, updatedAt }, user: { id, email, firstName, lastName, role, createdAt, updatedAt } | null }` — select explícito, password nunca retorna; inexistente → 404 "Profissional não encontrado."; Professional sem User → 200 com `user=null` (a tela futura trata)
- **PATCH**: completo (não parcial) — exatamente 5 campos obrigatórios (`name`, `slug`, `email`, `firstName`, `lastName`); `role`/`password`/`professionalId`/`userId`/`id`/timestamps no body → 400 via `forbidNonWhitelisted`; password e role não são alterados por esta rota
- **Precheck**: Professional inexistente → 404; Professional + `user=null` → 409 "Este profissional não possui usuário associado." — nenhuma escrita antes dessas verificações (não cria User silenciosamente, não atualiza só o Professional)
- **Atomicidade**: uma única nested write Prisma (`professional.update` com `user.update` aninhado); os testes validam essa composição estruturalmente — não afirmam rollback real do PostgreSQL
- **Conflitos**: `P2002` → 409 com mensagens seguras (email → "E-mail já cadastrado." · slug → "Slug já cadastrado." · target desconhecido → 409 genérico) — a constraint unique é a autoridade, sem precheck de email/slug; `P2025` residual pós-precheck (concorrência/inconsistência — causa não distinguível de forma robusta, sem parsing de message) → 409 genérico "O cadastro foi alterado durante a operação. Recarregue e tente novamente."; outros erros não são mascarados
- **Riscos operacionais**: alterar slug muda a URL pública do profissional (sem redirect automático do slug antigo — dívida operacional, não bug bloqueante); alterar o email muda a credencial de login do profissional; sem confirmação por email nesta versão
- **Testes**: `admin-edit-professional.spec.ts` (36 novos — cadeia real de guards + ValidationPipe real, Prisma mockado, sem banco real); admin **82/82** (4 suítes); suíte completa backend **164/164** (15 suítes); `npm run build` PASS; frontend inalterado (38/38)
- **Sem mudança**: schema Prisma (nenhuma migration), rotas públicas, auth existente, frontend
- **Pendente (não implementado)**: frontend de edição (`/admin/professionals/[id]/edit` + ação "Editar" na listagem), edição end-to-end via UI, suspensão/reativação, exclusão, reset de senha, alteração de role, pagamentos, auditoria, métricas avançadas
- **Commit**: `98f9a46` — `feat(admin): add professional edit endpoints`

## 2026-10-18 — Frontend ADMIN: formulário de criação de profissional (commit d7c81d8)

- **Nova rota**: `/admin/professionals/new` — dentro do route group `(protected)`, herda o `AdminRoute` existente; sem guard novo, sem auth paralelo, sem cliente HTTP paralelo
- **Formulário** (react-hook-form): 6 campos — nome profissional, slug, e-mail, primeiro nome, sobrenome, senha inicial
- **Slug**: sugerido a partir do nome enquanto nunca editado manualmente; sugestão é editável e, após edição manual, mudanças no nome não sobrescrevem o slug. Isso é APENAS conveniência de UX do frontend — o backend **não** normaliza slug, apenas valida o formato permitido
- **Senha inicial**: definida manualmente pelo ADMIN (mín. 8 no frontend; backend autoridade); enviada no POST; não persistida nem exibida pelo frontend (sem toast/console/storage); backend aplica bcrypt antes de salvar
- **Payload**: exatamente os 6 campos do contrato — sem role, professionalId, ids ou timestamps; backend continua forçando `role = PROFESSIONAL`
- **Erros**: 400 → validação legível · 409 e-mail → erro no campo e-mail · 409 slug → erro no campo slug · 409 desconhecido → erro geral seguro · 401 → interceptor ADMIN existente · 403 → acesso negado sem logout indevido · 5xx/rede → erro genérico com retry
- **Sucesso**: 201 → toast "Profissional criado com sucesso." → navegação para `/admin/professionals`; proteção contra duplo submit; botão "Novo profissional" adicionado na listagem
- **Testes**: `tests/admin-create-professional.test.tsx` (20 novos — Vitest + Testing Library, mocks, zero backend real); frontend total **38/38** (6 suítes); `npm run build` PASS; rota registrada; nenhuma dependência nova
- **Safe smoke backend em produção (2026-10-18)**: POST sem JWT → 401 · POST como PROFESSIONAL → 403 · ADMIN + DTO inválido → 400 (role extra rejeitada) · GETs ADMIN → 200 · nenhuma criação inesperada. Primeiro 201 real ainda não executado em produção (reservado para um profissional verdadeiro)
- **Dívidas mantidas**: whitespace-only em alguns campos do backend (não bloqueante); CRUD administrativo restante pendente
- **Pendente (não implementado)**: edição, suspensão/reativação, exclusão, alteração de role/senha, pagamentos, auditoria, métricas
- **Commit**: `d7c81d8` — `feat(admin): add professional creation form`

## 2026-10-18 — Criação administrativa Professional + User (commit cfc4ad2)

- **Nova rota**: `POST /admin/professionals` — `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)`; ADMIN → 201 · PROFESSIONAL → 403 · sem JWT → 401. Primeira operação de escrita do backoffice
- **Contrato**: cria 1 Professional (`name`, `slug`) + 1 User associado (`email`, `firstName`, `lastName`, `password` inicial). `role` é forçada internamente para `PROFESSIONAL` — o cliente não controla role/ids/timestamps (campos fora do DTO → 400 via `forbidNonWhitelisted`)
- **Atomicidade**: uma única nested write Prisma (`professional.create` com `user.create` aninhado) — sem `user.create` separado; a associação nasce da relação. Os testes validam a operação única estruturalmente (não afirmam rollback real do PostgreSQL)
- **Password**: hash bcrypt custo 10 (consistente com auth atual), antes da escrita; plaintext nunca é retornado; `select` explícito sem password nos dois níveis
- **Conflitos**: `P2002` mapeado para 409 — email → "E-mail já cadastrado." · slug → "Slug já cadastrado." · target desconhecido → 409 genérico seguro; sem expor meta/constraint/stack; outros erros seguem tratamento normal
- **Resposta 201**: `{ professional: { id, slug, name, createdAt }, user: { id, email, firstName, lastName, role, professionalId, createdAt } }` — sem password
- **Testes**: `admin-create-professional.spec.ts` (25 novos — cadeia real de guards + ValidationPipe real, Prisma mockado, sem banco real); admin 46/46; suíte completa **128/128** (14 suítes); `npm run build` PASS
- **Dívida não bloqueante (existente)**: `name`/`firstName`/`lastName` seguem o padrão atual de `@IsNotEmpty` — whitespace-only passa; não corrigido aqui, não é vulnerabilidade crítica
- **Sem mudança**: schema Prisma (nenhuma migration), auth público, professionals.service, rotas públicas, frontend
- **Pendente (não implementado)**: frontend da criação (`/admin/professionals/new`), edição, suspensão/reativação, exclusão, alteração de role/senha, pagamentos, auditoria, métricas
- **Commit**: `cfc4ad2` — `feat(admin): add professional creation`

## 2026-10-16 — Frontend ADMIN read-only (commit f420ac0)

- **Rotas** (route groups, sem segmento na URL): `/admin/login` (público), `/admin` e `/admin/professionals` (protegidas por `AdminRoute` via `app/admin/(protected)/layout.tsx`); login em `app/admin/(auth)` — fora do guard, sem loop
- **Auth reutilizado**: mesmo `useAuth()`, mesmo cliente Axios, mesmo `POST /auth/login` — sem segundo AuthContext e sem segundo cliente HTTP; backend continua a autoridade real de autorização
- **Comportamento**: `/admin/login` — ADMIN → `/admin`; não-ADMIN → sessão removida imediatamente, acesso recusado, permanece na página. Área protegida — sem sessão → `/admin/login`; PROFESSIONAL → `/login`; ADMIN → acesso
- **Interceptor 401**: em `/admin/*` → remove token e redireciona para `/admin/login`; exceção em `/admin/login` — remove o token mas NÃO recarrega a própria página (permite exibir erro de credenciais); fora da área ADMIN → `/login` (inalterado)
- **Logout**: ADMIN → `/admin/login`; profissional → `/login` (inalterado)
- **Listagem** (`GET /admin/professionals`): read-only; tabela responsiva; search com debounce 400 ms (trim, parâmetro omitido quando vazio, mudança de termo reseta offset); paginação Anterior/Próxima (limit 20); skeleton/empty state/erro com retry; `user=null` seguro; contagens services/appointments; data de criação; resposta obsoleta descartada (guarda de sequência)
- **Testes**: Vitest + Testing Library (jsdom) adicionados como devDependencies (nenhuma dependência de produção nova); 5 suítes, 18/18 passando; `npm run build` PASS; testes sem backend real
- **Dívida não bloqueante**: `AdminRoute` e o shell do layout usam instâncias independentes de `useAuth()` → dois `GET /auth/profile` por navegação na área protegida (sem impacto de segurança)
- **Pendentes (não implementados)**: criação/edição/suspensão/reativação/exclusão de profissionais, alteração de role/senha, pagamentos, auditoria, métricas — o que está pronto é apenas o backoffice READ-ONLY
- **Commit**: `f420ac0` — `feat(admin): add read-only admin frontend`

## 2026-10-16 — GET /admin/professionals: listagem administrativa read-only (commit b05169a)

- **Nova rota**: `GET /admin/professionals` — `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)`; ADMIN → 200 · PROFESSIONAL → 403 · sem JWT → 401. Read-only
- **AdminService** (novo, `admin.service.ts`): paginação server-side via `AdminListProfessionalsDto` (limit default 20 / máx 100, offset default 0); ordenação determinística `createdAt desc` + `id asc`; um único `where` usado por `findMany` e `count` (`Promise.all`)
- **Search**: opcional, `contains` case-insensitive em `name` OR `slug` OR `user.email` — nada além
- **Resposta**: `{ items, total, limit, offset }`; `select` explícito sem password — professional `{id, slug, name, avatarUrl, createdAt, updatedAt}` + `user {id, email, firstName, lastName, role}` (nullable) + `_count` de services/appointments
- **Sem mudança**: schema Prisma, migrations, JWT/auth, guards globais, rotas públicas (`/professionals` permanece separada); nenhum bypass ADMIN em rotas antigas
- **Testes**: `admin-professionals.spec.ts` (17 testes — cadeia real de guards + ValidationPipe real, Prisma mockado, sem banco real) — suíte completa 103/103 (13 suítes); `npm run build` limpo
- **Commit**: `b05169a` — `feat(admin): add professionals list`
- **Pendente (não implementado)**: frontend ADMIN, criação de Professional+User por ADMIN, edição, suspensão/reativação

## 2026-10-15 — Fundação ADMIN: RBAC (@Roles + RolesGuard) + GET /admin/me (commit 338b3c6)

- **RBAC adicionado**: `decorators/roles.decorator.ts` (`@Roles` tipado pelo enum `Role` do Prisma, `ROLES_KEY` explícita) + `guards/roles.guard.ts` (Reflector `getAllAndOverride`, route-level, sem metadata → permite, sem query ao banco)
- **Fluxo**: JWT (payload sem role) → JwtAuthGuard → JwtStrategy consulta User no banco a cada request → `req.user.role` → RolesGuard → `@Roles(Role.ADMIN)`
- **Primeira rota ADMIN**: `GET /admin/me` — `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)`; retorna somente `userId`, `email`, `firstName`, `lastName`, `role`
- **Comportamento**: ADMIN → 200 · PROFESSIONAL → 403 · sem JWT → 401
- **Sem mudança**: payload JWT, schema Prisma, migrations, rotas públicas, guards globais (só ThrottlerGuard)
- **Testes**: 86/86 passando (12 suítes) — `roles.guard.spec.ts` (6) + `admin.controller.spec.ts` (4, cadeia real com Prisma mockado)
- **Commit**: `338b3c6` — `feat(admin): add role-based authorization foundation`
- **Pendente (não implementado)**: `/admin/professionals`, frontend ADMIN, criação de Professional+User por ADMIN, suspensão/reativação

## 2026-10-15 — SEC-001: Ownership check em GET /professionals/:id (commit cd0cd21)

### Correção — SEC-001
- **Correção**: `findOneByIdForOwner()` no `ProfessionalsService` — `professionalId` confiável vem exclusivamente de `req.user` (JWT); rota `GET /professionals/:id` não confia mais no `:id` da URL
- **Cross-tenant bloqueado**: Professional A consultando B → 404 (anti-enumeração, padrão do módulo services); sem `professionalId` autenticado → 403
- **Testes**: `professionals-ownership.spec.ts` (6 testes) — 34/34 passando no módulo; `npm run build` limpo
- **Commit**: `cd0cd21` — `fix(professionals): enforce ownership on private lookup`
- **Escopo**: backend apenas; rotas públicas intactas; sem bypass ADMIN

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