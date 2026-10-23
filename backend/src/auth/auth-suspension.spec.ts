import 'reflect-metadata';

/*
 * Segredo EXCLUSIVO deste teste — definido no processo do jest,
 * sem ler .env. Precisa existir antes do compile (requireJwtSecret).
 */
process.env.JWT_SECRET = 'auth-suspension-test-secret';

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
 * Suspensão no fluxo de autenticação — cadeia REAL
 * (login e JwtStrategy consultam o mock do banco a cada request).
 *
 * Ponto crítico provado aqui: JWT válido emitido ANTES da
 * suspensão é bloqueado na próxima request (403), porque o
 * JwtStrategy já consulta User+Professional no banco — o
 * status é lido do banco, nunca do payload.
 *
 * A mensagem de suspensão no login só aparece DEPOIS da senha
 * correta (antes disso, credenciais inválidas → 401 genérico —
 * o login não vira enumeração de status).
 * ============================================================
 */
describe('Suspensão — login e JwtStrategy (mocks, sem banco)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const PASSWORD = 'senha-teste-123';

  // Shape real visto pelos queries (login: findUnique por email com
  // include professional; JwtStrategy: findUnique por id com include
  // professional; validateUser: findUnique por id com select).
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
      professional: { id: 'prof-a', status: 'ACTIVE' },
    },
    'user-pro-susp': {
      id: 'user-pro-susp',
      email: 'suspensa@test.local',
      firstName: 'Suspensa',
      lastName: 'Pro',
      role: 'PROFESSIONAL',
      professional: { id: 'prof-s', status: 'SUSPENDED' },
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
        /*
         * JwtStrategy busca por id; AuthService.login busca por email.
         */
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
  it('24. Professional ACTIVE + senha correta → login normal', async () => {
    const res = await login('ativa@test.local', PASSWORD).expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.role).toBe('PROFESSIONAL');
  });

  it('25. Professional SUSPENSO + senha correta → 403 com mensagem segura', async () => {
    const res = await login('suspensa@test.local', PASSWORD).expect(403);

    expect(res.body.message).toBe(
      'Conta suspensa. Entre em contato com o administrador.',
    );
  });

  it('26. SUSPENSO + senha ERRADA → 401 genérico, sem revelar suspensão', async () => {
    const res = await login('suspensa@test.local', 'senha-errada-123').expect(401);

    expect(res.body.message).toBe('Credenciais inválidas.');
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain('suspens');
  });

  it('27. ADMIN continua logando normalmente', async () => {
    const res = await login('admin@test.local', PASSWORD).expect(201);

    expect(res.body.user.role).toBe('ADMIN');
  });

  it('28. User sem Professional não quebra o auth', async () => {
    const res = await login('orfa@test.local', PASSWORD).expect(201);

    expect(res.body.accessToken).toBeDefined();
  });

  it('29. resposta de login nunca expõe password', async () => {
    const res = await login('ativa@test.local', PASSWORD).expect(201);

    expect(JSON.stringify(res.body)).not.toContain('password');
    expect(res.body.user).not.toHaveProperty('password');
  });

  /*
   * ============================================================
   * JWT ANTIGO — bloqueio na próxima request (ponto crítico)
   * ============================================================
   */
  it('30. JWT válido de Professional ACTIVE → rota protegida passa', async () => {
    const token = jwtService.sign({
      sub: 'user-pro-active',
      email: 'ativa@test.local',
    });

    const res = await profile(token).expect(200);
    expect(res.body.id).toBe('user-pro-active');
  });

  it('31. JWT válido emitido ANTES da suspensão → próxima request → 403', async () => {
    // Token assinado quando o profissional ainda estava ACTIVE no
    // banco; o status SUSPENDED está no mock (banco) — o JwtStrategy
    // consulta o banco em toda request e bloqueia aqui.
    const token = jwtService.sign({
      sub: 'user-pro-susp',
      email: 'suspensa@test.local',
    });

    const res = await profile(token).expect(403);
    expect(res.body.message).toBe(
      'Conta suspensa. Entre em contato com o administrador.',
    );
  });

  it('32. Professional reativado no banco → validate volta a passar', async () => {
    const token = jwtService.sign({
      sub: 'user-pro-susp',
      email: 'suspensa@test.local',
    });

    users['user-pro-susp'].professional.status = 'ACTIVE';
    try {
      await profile(token).expect(200);
    } finally {
      users['user-pro-susp'].professional.status = 'SUSPENDED';
    }
  });

  it('33. ADMIN nunca é bloqueado pelo estado de suspensão', async () => {
    const token = jwtService.sign({
      sub: 'user-admin',
      email: 'admin@test.local',
    });

    await profile(token).expect(200);
  });

  it('34. user inexistente no banco mantém comportamento atual (401)', async () => {
    const token = jwtService.sign({
      sub: 'user-fantasma',
      email: 'fantasma@test.local',
    });

    const res = await profile(token).expect(401);
    expect(res.body.message).toBe('Usuário não encontrado.');
  });
});
