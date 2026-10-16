# Backend - Regras de Desenvolvimento

## Linguagem e Qualidade
- TypeScript 5.7.3 com `strictNullChecks: false` em `tsconfig.json`
  - **DÍVIDA TÉCNICA:** migração para `strict: true` planejada mas NÃO automática
- Usar `class-validator` / `class-transformer` em todos os DTOs.
- Injeção de dependência NestJS obrigatória.
- ValidationPipe global ativo com `whitelist`, `forbidNonWhitelisted` e `transform`.

## Estrutura
- Módulos por domínio: appointments, professionals, services, availabilities, auth, prisma.
- Serviços não expõem Prisma diretamente; usar camada PrismaService.
- Controllers enxutos, apenas roteamento/HTTP.

## professionalId — Regra de Ownership

### Rotas Privadas / Operações Autenticadas
- Ownership/identidade deve vir EXCLUSIVAMENTE de `req.user.professionalId`.
- Nunca confiar em `professionalId` recebido do body/query para autorização.
- Estado atual: appointments ✅, availabilities ✅, professionals/me ✅, professionals/:id ✅ (cd0cd21)
- Problemas confirmados: services sem guards (C1). ~~professionals/:id sem ownership (C2)~~ — ✅ resolvido (cd0cd21)

### Rotas Públicas
- `professionalId` pode ser recebido como identificador do profissional-alvo
  (ex: `GET /appointments/available?professionalId=xxx`)
- Isso NÃO concede acesso a dados ou operações privadas

## Banco e ORM
- PostgreSQL + Prisma ORM (v6).
- Migrations: ⏸ existência em `backend/prisma/migrations/` não confirmada (terminal indisponível)
- Nunca editar `schema.prisma` sem criar migration.

## Autenticação
- JWT + Passport, bcrypt para hash.
- Guards em rotas protegidas.
- **Risco ativo:** JWT_SECRET com fallback hardcoded em `jwt.strategy.ts:12`
  - **Melhoria planejada:** fazer app falhar se JWT_SECRET não estiver definido
- `req.user` contém: `{ userId, email, role, professionalId?, firstName, lastName }`

## Documentação
- Atualizar README.md do backend ao adicionar endpoint.
- Comentários JSDoc em serviços críticos (business logic).
- Atualizar documentação APENAS para mudanças relevantes (ver AGENTS.md — "Quando atualizar documentação")

## Observações
- Sempre responder em português BR.