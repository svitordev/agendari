import 'reflect-metadata';

/*
 * Segredo EXCLUSIVO deste teste — definido no processo do jest,
 * sem ler .env. Precisa existir antes do compile (requireJwtSecret).
 */
process.env.JWT_SECRET = 'auth-archived-test-secret';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import * as bcrypt from 'bcrypt';

import { AuthModule } from './auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/*
 * ============================================================
 * Arquivamento no fluxo de autenticação — cadeia REAL
 * (login e JwtStrategy consultam o mock do banco a cada request).
 *
 * Regras provadas aqui:
 * - senha correta vem ANTES de revelar o estado da conta
 *   (senha errada em User arquivado → 401 genérico);
 * - arquivamento tem PRIORIDADE sobre suspensão
 *   (deletedAt != null vence mesmo com status SUSPENDED);
 * - JWT emitido antes do archive é bloqueado na próxima request;
 * - ADMIN nunca é bloqueado; User sem Professional intacto.
 * ============================================================
 */
describe('Arquivamento — login e JwtStrategy (mocks, sem banco)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const PASSWORD = 'senha-teste-123';
  const ARCHIVED_AT = new Date('2026-10-20T12:00:00.000Z');

  const ARCHIVED_MESSAGE =
    'Este perfil foi desativado. Entre em contato com o administrador.';
  const SUSPENDED_MESSAGE =
    'Conta suspensa. Entre em contato com o administrador.';

  const users: Record<string, any> = {
    'user-admin': {
      id: 'user-admin',
      email: 'admin@test.local',
      firstName: 'Ada',
      lastName: 'Admin',
      role: 'ADMIN',
      professional: null,
    },
    'user-pro-active': {
      id: 'user-pro-active',
      email: 'ativa@test.local',
      firstName: 'Ativa',
      lastName: 'Pro',
      role: 'PROFESSIONAL',
      professional: { id: 'prof-a', status: 'ACTIVE', deletedAt: null },
    },
    'user-pro-susp': {
      id: 'user-pro-susp',
      email: 'suspensa@test.local',
      firstName: 'Suspensa',
      lastName: 'Pro',
      role: 'PROFESSIONAL',
      professional: { id: 'prof-s', status: 'SUSPENDED', deletedAt: null },
    },
    'user-pro-arch': {
      id: 'user-pro-arch',
      email: 'arquivada@test.local',
      firstName: 'Arquivada',
      lastName: 'Pro',
      role: 'PROFESSIONAL',
      professional: { id: 'prof-arch', status: 'ACTIVE', deletedAt: ARCHIVED_AT },
    },
    'user-pro-arch-susp': {
      id: 'user-pro-arch-susp',
      email: 'arq-susp@test.local',
      firstName: 'Arq',
      lastName: 'Susp',
      role: 'PROFESSIONAL',
      professional: { id: 'prof-arch-susp', status: 'SUSPENDED', deletedAt: ARCHIVED_AT },
    },
    'user-orphan': {
      id: 'user-orphan',
      email: 'orfa@test.local',
      firstName: 'Órfã',
      lastName: 'SemPro',
      role: 'PROFESSIONAL',
      professional: null,
    },
  };

  const mockPrisma = {
    user: {
      findUnique: jest.fn(({ where }: any) => {
        const key = where.id ?? where.email;
        const found = Object.values(users).find(
          (u: any) => u.id === key || u.email === key,
        );
        return Promise.resolve(found ?? null);
      }),
    },
  };

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });

  const profile = (token: string) =>
    request(app.getHttpServer()).get('/auth/profile').set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    // Hash real para bcrypt.compare (hash direto no fixture).
    const hash = await bcrypt.hash(PASSWORD, 10);
    for (const u of Object.values(users)) {
      u.password = hash;
    }

    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = module.createNestApplication();
    await app.init();

    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  /*
   * ============================================================
   * LOGIN
   * ============================================================
   */
  it('1. Professional ACTIVE não-arquivado → login normal (regressão)', async () => {
    const res = await login('ativa@test.local', PASSWORD).expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.role).toBe('PROFESSIONAL');
  });

  it('2. Professional SUSPENSO não-arquivado → 403 suspensão (regressão)', async () => {
    const res = await login('suspensa@test.local', PASSWORD).expect(403);

    expect(res.body.message).toBe(SUSPENDED_MESSAGE);
  });

  it('3. Professional ARQUIVADO (ACTIVE) + senha correta → 403 desativado', async () => {
    const res = await login('arquivada@test.local', PASSWORD).expect(403);

    expect(res.body.message).toBe(ARCHIVED_MESSAGE);
  });

  it('4. ARQUIVADO + SUSPENDED → 403 desativado (archive tem prioridade)', async () => {
    const res = await login('arq-susp@test.local', PASSWORD).expect(403);

    expect(res.body.message).toBe(ARCHIVED_MESSAGE);
  });

  it('5. ARQUIVADO + senha ERRADA → 401 genérico, sem revelar arquivamento', async () => {
    const res = await login('arquivada@test.local', 'senha-errada-123').expect(401);

    expect(res.body.message).toBe('Credenciais inválidas.');
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain('desativ');
  });

  it('6. ADMIN continua logando normalmente', async () => {
    const res = await login('admin@test.local', PASSWORD).expect(201);

    expect(res.body.user.role).toBe('ADMIN');
  });

  it('7. User sem Professional não quebra o auth', async () => {
    const res = await login('orfa@test.local', PASSWORD).expect(201);

    expect(res.body.accessToken).toBeDefined();
  });

  /*
   * ============================================================
   * JWT ANTIGO — bloqueio na próxima request (ponto crítico)
   * ============================================================
   */
  it('8. JWT válido de Professional ACTIVE não-arquivado → rota protegida passa', async () => {
    const token = jwtService.sign({
      sub: 'user-pro-active',
      email: 'ativa@test.local',
    });

    const res = await profile(token).expect(200);
    expect(res.body.id).toBe('user-pro-active');
  });

  it('9. JWT válido emitido ANTES do archive → próxima request → 403', async () => {
    const token = jwtService.sign({
      sub: 'user-pro-arch',
      email: 'arquivada@test.local',
    });

    const res = await profile(token).expect(403);
    expect(res.body.message).toBe(ARCHIVED_MESSAGE);
  });

  it('10. JWT de arquivada+suspensa → mensagem de arquivamento (prioridade)', async () => {
    const token = jwtService.sign({
      sub: 'user-pro-arch-susp',
      email: 'arq-susp@test.local',
    });

    const res = await profile(token).expect(403);
    expect(res.body.message).toBe(ARCHIVED_MESSAGE);
  });

  it('11. JWT de suspensa não-arquivada → mensagem de suspensão (regressão)', async () => {
    const token = jwtService.sign({
      sub: 'user-pro-susp',
      email: 'suspensa@test.local',
    });

    const res = await profile(token).expect(403);
    expect(res.body.message).toBe(SUSPENDED_MESSAGE);
  });

  it('12. JWT de ADMIN nunca é bloqueado', async () => {
    const token = jwtService.sign({
      sub: 'user-admin',
      email: 'admin@test.local',
    });

    await profile(token).expect(200);
  });
});
