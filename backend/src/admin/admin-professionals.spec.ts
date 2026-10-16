import 'reflect-metadata';

/*
 * Segredo EXCLUSIVO deste teste — definido no processo do jest,
 * sem ler .env. Precisa existir antes do compile (requireJwtSecret).
 */
process.env.JWT_SECRET = 'admin-professionals-test-secret';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { AdminModule } from './admin.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProfessionalsModule } from '../professionals/professionals.module';

/*
 * ============================================================
 * GET /admin/professionals — listagem administrativa read-only.
 *
 * Cadeia REAL: JwtAuthGuard → JwtStrategy → RolesGuard.
 * ValidationPipe REAL (mesmas opções do main.ts) para os casos
 * de paginação inválida → 400. Prisma mockado — nenhum banco.
 * ============================================================
 */
describe('GET /admin/professionals — listagem ADMIN (mocks, sem banco)', () => {
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
      professional: { id: 'prof-1' },
    },
  };

  const itemsFixture = [
    {
      id: 'prof-1',
      slug: 'ana',
      name: 'Ana Pro',
      avatarUrl: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      user: {
        id: 'user-pro',
        email: 'pro@test.local',
        firstName: 'Ana',
        lastName: 'Pro',
        role: 'PROFESSIONAL',
      },
      _count: { services: 3, appointments: 10 },
    },
    {
      id: 'prof-2',
      slug: 'sem-user',
      name: 'Sem User SA',
      avatarUrl: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      user: null,
      _count: { services: 0, appointments: 0 },
    },
  ];

  const mockPrisma = {
    user: {
      findUnique: jest.fn(({ where }: any) => {
        const key = where.id ?? where.email;
        return Promise.resolve(users[key] ?? null);
      }),
    },
    professional: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const adminToken = () =>
    jwtService.sign({ sub: 'user-admin', email: 'admin@test.local' });
  const proToken = () =>
    jwtService.sign({ sub: 'user-pro', email: 'pro@test.local' });

  const lastFindManyArgs = () =>
    mockPrisma.professional.findMany.mock.calls[
      mockPrisma.professional.findMany.mock.calls.length - 1
    ][0];
  const lastCountArgs = () =>
    mockPrisma.professional.count.mock.calls[
      mockPrisma.professional.count.mock.calls.length - 1
    ][0];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule, AdminModule, ProfessionalsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = module.createNestApplication();
    // Mesmas opções do ValidationPipe global do main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    jwtService = app.get(JwtService);
  });

  beforeEach(() => {
    mockPrisma.professional.findMany.mockReset().mockResolvedValue(itemsFixture);
    mockPrisma.professional.count.mockReset().mockResolvedValue(2);
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. ADMIN → 200 com shape { items, total, limit, offset }', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/professionals')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(Object.keys(res.body).sort()).toEqual([
      'items',
      'limit',
      'offset',
      'total',
    ]);
    expect(res.body.items).toEqual(itemsFixture);
    expect(res.body.total).toBe(2);
  });

  it('2. PROFESSIONAL → 403', async () => {
    await request(app.getHttpServer())
      .get('/admin/professionals')
      .set('Authorization', `Bearer ${proToken()}`)
      .expect(403);
  });

  it('3. sem JWT → 401', async () => {
    await request(app.getHttpServer()).get('/admin/professionals').expect(401);
  });

  it('4. paginação default → limit 20 / offset 0', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/professionals')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(res.body.limit).toBe(20);
    expect(res.body.offset).toBe(0);
    expect(lastFindManyArgs().take).toBe(20);
    expect(lastFindManyArgs().skip).toBe(0);
  });

  it('5. paginação customizada → limit 5 / offset 10', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/professionals?limit=5&offset=10')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(res.body.limit).toBe(5);
    expect(res.body.offset).toBe(10);
    expect(lastFindManyArgs().take).toBe(5);
    expect(lastFindManyArgs().skip).toBe(10);
  });

  it('6. limit < 1 → 400', async () => {
    await request(app.getHttpServer())
      .get('/admin/professionals?limit=0')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(400);
  });

  it('7. limit > 100 → 400', async () => {
    await request(app.getHttpServer())
      .get('/admin/professionals?limit=101')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(400);
  });

  it('8. offset negativo → 400', async () => {
    await request(app.getHttpServer())
      .get('/admin/professionals?offset=-1')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(400);
  });

  it('9. resposta não contém password', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/professionals')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('10. Professional sem User é tratado (user = null)', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/professionals')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(res.body.items[1].user).toBeNull();
  });

  it('11. orderBy determinístico: createdAt desc + id asc', async () => {
    await request(app.getHttpServer())
      .get('/admin/professionals')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(lastFindManyArgs().orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'asc' },
    ]);
  });

  it('12. total vem de count com o MESMO where do findMany', async () => {
    await request(app.getHttpServer())
      .get('/admin/professionals?search=ana')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(lastCountArgs().where).toEqual(lastFindManyArgs().where);
  });

  it('13. search por name gera OR com contains insensitive', async () => {
    await request(app.getHttpServer())
      .get('/admin/professionals?search=Ana')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(lastFindManyArgs().where.OR[0]).toEqual({
      name: { contains: 'Ana', mode: 'insensitive' },
    });
  });

  it('14. search cobre slug no OR', async () => {
    await request(app.getHttpServer())
      .get('/admin/professionals?search=x')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(lastFindManyArgs().where.OR[1]).toEqual({
      slug: { contains: 'x', mode: 'insensitive' },
    });
  });

  it('15. search cobre user.email no OR', async () => {
    await request(app.getHttpServer())
      .get('/admin/professionals?search=@test')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(lastFindManyArgs().where.OR[2]).toEqual({
      user: { email: { contains: '@test', mode: 'insensitive' } },
    });
  });

  it('16. GET /professionals público permanece intacto (sem guard)', async () => {
    const res = await request(app.getHttpServer())
      .get('/professionals')
      .expect(200);

    // Rota pública retorna o array direto do service.
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('17. GET /admin/me permanece intacto', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/me')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(res.body).toEqual({
      userId: 'user-admin',
      email: 'admin@test.local',
      firstName: 'Ada',
      lastName: 'Admin',
      role: 'ADMIN',
    });
  });
});
