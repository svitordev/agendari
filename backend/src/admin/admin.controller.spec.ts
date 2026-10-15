import 'reflect-metadata';

/*
 * Segredo EXCLUSIVO deste teste — definido no processo do jest,
 * sem ler .env. Precisa existir antes do compile (requireJwtSecret).
 */
process.env.JWT_SECRET = 'roles-guard-test-secret';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import * as bcrypt from 'bcrypt';

import { AdminModule } from './admin.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/*
 * ============================================================
 * GET /admin/me — cadeia REAL: JwtAuthGuard → JwtStrategy →
 * RolesGuard. Prisma mockado (nenhum banco real).
 * Tokens assinados no formato atual do projeto: { sub, email }.
 * ============================================================
 */
describe('GET /admin/me — autorização por role (cadeia real)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const users: Record<string, any> = {
    'user-admin': {
      id: 'user-admin',
      email: 'admin@test.local',
      firstName: 'Ada',
      lastName: 'Admin',
      role: 'ADMIN',
      professional: null,
    },
    'user-pro': {
      id: 'user-pro',
      email: 'pro@test.local',
      firstName: 'Ana',
      lastName: 'Pro',
      role: 'PROFESSIONAL',
      professional: { id: 'pro-1' },
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

  beforeAll(async () => {
    /*
     * Hash real para o login de teste (bcrypt.compare exige hash válido).
     */
    users['user-pro'].password = await bcrypt.hash('senha-teste-123', 10);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule, AdminModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = module.createNestApplication();
    await app.init();

    jwtService = app.get(JwtService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('1. ADMIN autenticado → 200 com apenas os campos mínimos', async () => {
    const token = jwtService.sign({
      sub: 'user-admin',
      email: 'admin@test.local',
    });

    const res = await request(app.getHttpServer())
      .get('/admin/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    /*
     * toEqual estrito: qualquer campo extra (password, professional,
     * tokens) quebraria este teste.
     */
    expect(res.body).toEqual({
      userId: 'user-admin',
      email: 'admin@test.local',
      firstName: 'Ada',
      lastName: 'Admin',
      role: 'ADMIN',
    });
    expect(Object.keys(res.body).sort()).toEqual([
      'email',
      'firstName',
      'lastName',
      'role',
      'userId',
    ]);
  });

  it('2. PROFESSIONAL autenticado → 403', async () => {
    const token = jwtService.sign({
      sub: 'user-pro',
      email: 'pro@test.local',
    });

    await request(app.getHttpServer())
      .get('/admin/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('3. sem JWT → 401 (JwtAuthGuard executa antes do RolesGuard)', async () => {
    await request(app.getHttpServer()).get('/admin/me').expect(401);
  });

  it('4. login profissional continua funcionando e rota protegida sem JWT → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'pro@test.local', password: 'senha-teste-123' })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.role).toBe('PROFESSIONAL');

    /*
     * Rota protegida existente continua exigindo JWT (401 sem token)
     * e sem @Roles — o RolesGuard não a bloqueia.
     */
    await request(app.getHttpServer()).get('/auth/profile').expect(401);
  });
});
