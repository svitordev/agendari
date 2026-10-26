import 'reflect-metadata';

/*
 * Segredo EXCLUSIVO deste teste — definido no processo do jest,
 * sem ler .env. Precisa existir antes do compile (requireJwtSecret).
 */
process.env.JWT_SECRET = 'admin-status-test-secret';

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
 * PATCH /admin/professionals/:id/status — suspensão/reativação.
 *
 * Cadeia REAL: JwtAuthGuard → JwtStrategy → RolesGuard.
 * ValidationPipe REAL (mesmas opções do main.ts).
 * Prisma totalmente mockado — nenhum banco real.
 *
 * Estado (status) fica SOMENTE em Professional (fonte única).
 * Idempotência: no-op não chama update (updatedAt não é
 * alterado artificialmente). Professional sem User funciona.
 * ============================================================
 */
describe('PATCH /admin/professionals/:id/status — estado operacional (mocks, sem banco)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  // Usuários vistos pelo JwtStrategy (via user.findUnique pelo sub).
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
      professional: { id: 'prof-active' },
    },
  };

  // Linhas vistas pelo service (professional.findUnique).
  // Shape do select aplicado pelo service — sem password.
  const rows: Record<string, any> = {
    'prof-active': {
      id: 'prof-active',
      name: 'Ana Pro',
      slug: 'ana',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      user: {
        id: 'user-pro',
        email: 'pro@test.local',
        firstName: 'Ana',
        lastName: 'Pro',
        role: 'PROFESSIONAL',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    },
    'prof-susp': {
      id: 'prof-susp',
      name: 'Bia Pro',
      slug: 'bia',
      status: 'SUSPENDED',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      user: {
        id: 'user-pro2',
        email: 'bia@test.local',
        firstName: 'Bia',
        lastName: 'Pro',
        role: 'PROFESSIONAL',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    },
    'prof-nouser-susp': {
      id: 'prof-nouser-susp',
      name: 'Sem Usuario Suspenso',
      slug: 'sem-usuario-susp',
      status: 'SUSPENDED',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      user: null,
    },
    'prof-nouser-active': {
      id: 'prof-nouser-active',
      name: 'Sem Usuario Ativo',
      slug: 'sem-usuario-ativo',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      user: null,
    },
  };

  const mockPrisma = {
    user: {
      findUnique: jest.fn(({ where }: any) => {
        const key = where.id ?? where.email;
        return Promise.resolve(users[key] ?? null);
      }),
      create: jest.fn(),
      update: jest.fn(),
    },
    professional: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(rows[where.id] ?? null),
      ),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      // Echo do Prisma update: linha + data aplicada (select ignorado no mock).
      update: jest.fn((args: any) => {
        const base = rows[args.where.id];
        if (!base) return Promise.resolve(null);
        return Promise.resolve({
          ...base,
          ...(args.data ?? {}),
          updatedAt: new Date('2026-03-01T00:00:00.000Z'),
        });
      }),
    },
  };

  const adminToken = () =>
    jwtService.sign({ sub: 'user-admin', email: 'admin@test.local' });
  const proToken = () =>
    jwtService.sign({ sub: 'user-pro', email: 'pro@test.local' });

  const lastUpdateArgs = () =>
    mockPrisma.professional.update.mock.calls[
      mockPrisma.professional.update.mock.calls.length - 1
    ][0];

  const patchStatus = (
    id: string,
    body: Record<string, unknown>,
    token?: string,
  ) => {
    const req = request(app.getHttpServer()).patch(
      `/admin/professionals/${id}/status`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
  };

  const patchEdit = (
    id: string,
    body: Record<string, unknown>,
    token?: string,
  ) => {
    const req = request(app.getHttpServer()).patch(`/admin/professionals/${id}`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
  };

  const validEditBody = () => ({
    name: 'Ana Silva',
    slug: 'ana-silva',
    email: 'nova-email@test.local',
    firstName: 'Ana Clara',
    lastName: 'Souza',
  });

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
    mockPrisma.professional.findUnique.mockReset().mockImplementation(
      ({ where }: any) => Promise.resolve(rows[where.id] ?? null),
    );
    mockPrisma.professional.update.mockReset().mockImplementation((args: any) => {
      const base = rows[args.where.id];
      if (!base) return Promise.resolve(null);
      return Promise.resolve({
        ...base,
        ...(args.data ?? {}),
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      });
    });
    mockPrisma.user.update.mockReset();
    mockPrisma.professional.create.mockReset();
    mockPrisma.user.create.mockReset();
    mockPrisma.professional.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.professional.count.mockReset().mockResolvedValue(0);
  });

  afterAll(async () => {
    await app.close();
  });

  /*
   * ============================================================
   * Guards e validação
   * ============================================================
   */
  it('1. PATCH status sem JWT → 401', async () => {
    await patchStatus('prof-active', { status: 'SUSPENDED' }).expect(401);
  });

  it('2. PATCH status com PROFESSIONAL → 403', async () => {
    await patchStatus('prof-active', { status: 'SUSPENDED' }, proToken()).expect(403);
    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });

  /*
   * ============================================================
   * Mudança real de estado
   * ============================================================
   */
  it('3. ADMIN suspende (ACTIVE → SUSPENDED) → 200', async () => {
    const res = await patchStatus('prof-active', { status: 'SUSPENDED' }, adminToken()).expect(200);

    expect(res.body.professional.status).toBe('SUSPENDED');
    expect(mockPrisma.professional.update).toHaveBeenCalledTimes(1);
  });

  it('4. ADMIN reativa (SUSPENDED → ACTIVE) → 200', async () => {
    const res = await patchStatus('prof-susp', { status: 'ACTIVE' }, adminToken()).expect(200);

    expect(res.body.professional.status).toBe('ACTIVE');
    expect(mockPrisma.professional.update).toHaveBeenCalledTimes(1);
  });

  it('5. id inexistente → 404 sem escrita', async () => {
    const res = await patchStatus('nao-existe', { status: 'SUSPENDED' }, adminToken()).expect(404);

    expect(res.body.message).toBe('Profissional não encontrado.');
    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });

  it('6. status inválido (fora do enum) → 400', async () => {
    await patchStatus('prof-active', { status: 'BANNED' }, adminToken()).expect(400);
    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });

  it('7. campo extra no body → 400 (fora do whitelist)', async () => {
    await patchStatus(
      'prof-active',
      { status: 'SUSPENDED', name: 'x' },
      adminToken(),
    ).expect(400);
    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });

  it('8. status pedido vai ao Prisma exatamente como enviado', async () => {
    await patchStatus('prof-active', { status: 'SUSPENDED' }, adminToken()).expect(200);

    expect(lastUpdateArgs().where).toEqual({ id: 'prof-active', deletedAt: null });
    expect(lastUpdateArgs().data.status).toBe('SUSPENDED');
  });

  it('9. nenhum outro campo vai ao Prisma na mudança de estado', async () => {
    await patchStatus('prof-active', { status: 'SUSPENDED' }, adminToken()).expect(200);

    expect(Object.keys(lastUpdateArgs().data)).toEqual(['status']);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  /*
   * ============================================================
   * Professional sem User
   * ============================================================
   */
  it('10. Professional sem User pode ser suspenso', async () => {
    const res = await patchStatus('prof-nouser-susp', { status: 'SUSPENDED' }, adminToken()).expect(200);

    // No-op idempotente (já suspenso) — sem escrita, sem 409.
    expect(res.body.professional.status).toBe('SUSPENDED');
    expect(res.body.user).toBeNull();
    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });

  it('11. Professional sem User pode ser reativado', async () => {
    const res = await patchStatus('prof-nouser-active', { status: 'SUSPENDED' }, adminToken()).expect(200);

    expect(res.body.professional.status).toBe('SUSPENDED');
    expect(res.body.user).toBeNull();
    expect(mockPrisma.professional.update).toHaveBeenCalledTimes(1);
  });

  /*
   * ============================================================
   * Idempotência — no-op NÃO gera escrita
   * ============================================================
   */
  it('12. ACTIVE → ACTIVE retorna 200', async () => {
    const res = await patchStatus('prof-active', { status: 'ACTIVE' }, adminToken()).expect(200);

    expect(res.body.professional.status).toBe('ACTIVE');
  });

  it('13. ACTIVE → ACTIVE NÃO chama update (sem write, updatedAt preservado)', async () => {
    await patchStatus('prof-active', { status: 'ACTIVE' }, adminToken()).expect(200);

    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });

  it('14. SUSPENDED → SUSPENDED retorna 200', async () => {
    const res = await patchStatus('prof-susp', { status: 'SUSPENDED' }, adminToken()).expect(200);

    expect(res.body.professional.status).toBe('SUSPENDED');
  });

  it('15. SUSPENDED → SUSPENDED NÃO chama update (sem write, updatedAt preservado)', async () => {
    await patchStatus('prof-susp', { status: 'SUSPENDED' }, adminToken()).expect(200);

    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });

  /*
   * ============================================================
   * Shape da resposta
   * ============================================================
   */
  it('16. status aparece na resposta da mudança real', async () => {
    const res = await patchStatus('prof-active', { status: 'SUSPENDED' }, adminToken()).expect(200);

    expect(Object.keys(res.body).sort()).toEqual(['professional', 'user']);
    expect(res.body.professional).toHaveProperty('status', 'SUSPENDED');
  });

  it('17. password continua ausente da resposta', async () => {
    const res = await patchStatus('prof-active', { status: 'SUSPENDED' }, adminToken()).expect(200);

    expect(JSON.stringify(res.body)).not.toContain('password');
    expect(res.body.user).not.toHaveProperty('password');
  });

  /*
   * ============================================================
   * Regressão — rotas admin existentes agora expõem status
   * ============================================================
   */
  it('18. listagem ADMIN retorna status (select inclui status)', async () => {
    mockPrisma.professional.findMany.mockResolvedValueOnce([
      rows['prof-active'],
      rows['prof-susp'],
    ]);
    mockPrisma.professional.count.mockResolvedValueOnce(2);

    const res = await request(app.getHttpServer())
      .get('/admin/professionals')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(res.body.items[0].status).toBe('ACTIVE');
    expect(res.body.items[1].status).toBe('SUSPENDED');

    const findManyArgs = mockPrisma.professional.findMany.mock.calls[0][0];
    expect(findManyArgs.select).toHaveProperty('status', true);
    expect(findManyArgs.select).not.toHaveProperty('password');
  });

  it('19. GET individual ADMIN retorna status (select inclui status)', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/professionals/prof-susp')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(res.body.professional.status).toBe('SUSPENDED');

    const findUniqueArgs = mockPrisma.professional.findUnique.mock.calls[0][0];
    expect(findUniqueArgs.select).toHaveProperty('status', true);
    expect(findUniqueArgs.select).not.toHaveProperty('password');
  });

  it('20. criação ADMIN retorna ACTIVE (select inclui status)', async () => {
    mockPrisma.professional.create.mockResolvedValueOnce({
      id: 'prof-new',
      slug: 'nova-prof',
      name: 'Nova Profissional',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      user: {
        id: 'user-new',
        email: 'nova@test.local',
        firstName: 'Nova',
        lastName: 'Pro',
        role: 'PROFESSIONAL',
        professionalId: 'prof-new',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    const res = await request(app.getHttpServer())
      .post('/admin/professionals')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        name: 'Nova Profissional',
        slug: 'nova-prof',
        email: 'nova@test.local',
        firstName: 'Nova',
        lastName: 'Pro',
        password: 'senha-forte-123',
      })
      .expect(201);

    expect(res.body.professional.status).toBe('ACTIVE');

    const createArgs = mockPrisma.professional.create.mock.calls[0][0];
    expect(createArgs.select).toHaveProperty('status', true);
    expect(createArgs.select).not.toHaveProperty('password');
    // O DTO de criação não controla status — data não pode trazer status.
    expect(createArgs.data).not.toHaveProperty('status');
  });

  it('21. edição dos 5 campos NÃO toca em status (preservado)', async () => {
    const res = await patchEdit('prof-susp', validEditBody(), adminToken()).expect(200);

    // O update da edição escreve exatamente name/slug/user — nunca status.
    expect(Object.keys(lastUpdateArgs().data).sort()).toEqual([
      'name',
      'slug',
      'user',
    ]);
    expect(lastUpdateArgs().data).not.toHaveProperty('status');
    // O echo do mock parte da linha real (SUSPENDED) — status preservado.
    expect(res.body.professional.status).toBe('SUSPENDED');
  });

  it('22. PATCH de edição NÃO aceita status no body → 400', async () => {
    await patchEdit(
      'prof-active',
      { ...validEditBody(), status: 'SUSPENDED' },
      adminToken(),
    ).expect(400);

    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });

  it('23. PATCH de edição continua rejeitando role e password', async () => {
    await patchEdit(
      'prof-active',
      { ...validEditBody(), role: 'ADMIN' },
      adminToken(),
    ).expect(400);
    await patchEdit(
      'prof-active',
      { ...validEditBody(), password: 'qualquer-coisa' },
      adminToken(),
    ).expect(400);

    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });
});
