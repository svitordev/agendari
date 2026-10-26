import 'reflect-metadata';

/*
 * Segredo EXCLUSIVO deste teste — definido no processo do jest,
 * sem ler .env. Precisa existir antes do compile (requireJwtSecret).
 */
process.env.JWT_SECRET = 'admin-archive-test-secret';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import request from 'supertest';

import { AdminModule } from './admin.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProfessionalsModule } from '../professionals/professionals.module';

/*
 * ============================================================
 * DELETE /admin/professionals/:id — arquivamento lógico (soft
 * delete). NUNCA hard delete: nenhuma linha é removida; User,
 * Services, Availability, Exceptions e Appointments permanecem.
 *
 * Cadeia REAL: JwtAuthGuard → JwtStrategy → RolesGuard +
 * ValidationPipe REAL. Prisma totalmente mockado — banco zero.
 *
 * Idempotência: já arquivado → 204 SEM escrita (deletedAt
 * anterior não é sobrescrito). Inexistente → 404. Race de
 * archive (P2025 + re-check confirma arquivado) → 204; P2025 sem linha → 404.
 * ============================================================
 */
describe('DELETE /admin/professionals/:id — arquivamento (mocks, sem banco)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const ARCHIVED_AT = new Date('2026-10-20T12:00:00.000Z');

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
  const rows: Record<string, any> = {
    'prof-active': {
      id: 'prof-active',
      name: 'Ana Pro',
      slug: 'ana',
      status: 'ACTIVE',
      deletedAt: null,
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
    'prof-nouser': {
      id: 'prof-nouser',
      name: 'Sem Usuario',
      slug: 'sem-usuario',
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      user: null,
    },
    'prof-archived': {
      id: 'prof-archived',
      name: 'Arquivada Pro',
      slug: 'arquivada',
      status: 'ACTIVE',
      deletedAt: ARCHIVED_AT,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      user: {
        id: 'user-arch',
        email: 'arch@test.local',
        firstName: 'Arq',
        lastName: 'Pro',
        role: 'PROFESSIONAL',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
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
      delete: jest.fn(),
    },
    professional: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(rows[where.id] ?? null),
      ),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    service: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    appointment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    availability: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    availabilityPeriod: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    availabilityException: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const adminToken = () =>
    jwtService.sign({ sub: 'user-admin', email: 'admin@test.local' });
  const proToken = () =>
    jwtService.sign({ sub: 'user-pro', email: 'pro@test.local' });

  const del = (id: string, token?: string) => {
    const req = request(app.getHttpServer()).delete(`/admin/professionals/${id}`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  const lastUpdateArgs = () =>
    mockPrisma.professional.update.mock.calls[
      mockPrisma.professional.update.mock.calls.length - 1
    ][0];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, AdminModule, AuthModule, ProfessionalsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = module.createNestApplication();
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

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockPrisma.professional.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.professional.count.mockReset().mockResolvedValue(0);
    mockPrisma.professional.create.mockReset();
    mockPrisma.professional.update.mockReset().mockResolvedValue(null);
    mockPrisma.professional.delete.mockReset();
    mockPrisma.professional.deleteMany.mockReset();
    for (const model of ['user', 'service', 'appointment', 'availability', 'availabilityPeriod', 'availabilityException'] as const) {
      for (const method of ['findUnique', 'findFirst', 'findMany', 'create', 'update', 'delete', 'deleteMany'] as const) {
        mockPrisma[model][method]?.mockReset?.();
      }
    }
    // Reinstala o resolver de user/professional findUnique após reset.
    mockPrisma.user.findUnique.mockReset();
    mockPrisma.professional.findUnique.mockReset();
    mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
      const key = where.id ?? where.email;
      return Promise.resolve(users[key] ?? null);
    });
    mockPrisma.professional.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(rows[where.id] ?? null),
    );
  });

  /*
   * ============================================================
   * AUTH / RBAC
   * ============================================================
   */
  it('1. DELETE sem token → 401', async () => {
    await del('prof-active').expect(401);
    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });

  it('2. DELETE com PROFESSIONAL → 403 (somente ADMIN)', async () => {
    await del('prof-active', proToken()).expect(403);
    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });

  /*
   * ============================================================
   * ARQUIVAMENTO
   * ============================================================
   */
  it('3. ADMIN arquiva Professional existente → 204 sem body', async () => {
    const res = await del('prof-active', adminToken()).expect(204);
    expect(res.text).toBe('');
    expect(mockPrisma.professional.update).toHaveBeenCalledTimes(1);
  });

  it('4. update escreve SOMENTE deletedAt com where condicional', async () => {
    await del('prof-active', adminToken()).expect(204);

    const args = lastUpdateArgs();
    expect(Object.keys(args.data)).toEqual(['deletedAt']);
    expect(args.data.deletedAt).toBeInstanceOf(Date);
    expect(args.where).toEqual({ id: 'prof-active', deletedAt: null });
  });

  it('5. nenhum hard delete Prisma (delete/deleteMany nunca chamados)', async () => {
    await del('prof-active', adminToken()).expect(204);

    expect(mockPrisma.professional.delete).not.toHaveBeenCalled();
    expect(mockPrisma.professional.deleteMany).not.toHaveBeenCalled();
  });

  it('6. User/Service/Appointment/Availability não são tocados', async () => {
    await del('prof-active', adminToken()).expect(204);

    for (const model of ['user', 'service', 'appointment', 'availability', 'availabilityPeriod', 'availabilityException'] as const) {
      for (const method of ['create', 'update', 'delete', 'deleteMany'] as const) {
        const fn = mockPrisma[model][method] as jest.Mock | undefined;
        if (fn) expect(fn).not.toHaveBeenCalled();
      }
    }
  });

  it('7. Professional sem User (user=null) arquiva normalmente', async () => {
    await del('prof-nouser', adminToken()).expect(204);

    const args = lastUpdateArgs();
    expect(args.where).toEqual({ id: 'prof-nouser', deletedAt: null });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('8. Professional inexistente → 404 com mensagem segura', async () => {
    const res = await del('nao-existe', adminToken()).expect(404);
    expect(res.body.message).toBe('Profissional não encontrado.');
    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });

  it('9. já arquivado → 204 com ZERO update (deletedAt anterior preservado)', async () => {
    const res = await del('prof-archived', adminToken()).expect(204);
    expect(res.text).toBe('');
    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });

  it('10. DELETE repetido é idempotente (1º escreve, 2º zero escrita)', async () => {
    // Fixture com estado real: o update persiste deletedAt na linha,
    // então o segundo DELETE enxerga o arquivamento feito pelo primeiro
    // e responde 204 SEM nova escrita.
    const row: any = {
      id: 'prof-idem',
      name: 'Idem Pro',
      slug: 'idem',
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      user: null,
    };
    rows['prof-idem'] = row;
    mockPrisma.professional.update.mockImplementationOnce((args: any) => {
      row.deletedAt = args.data.deletedAt;
      return Promise.resolve(row);
    });

    await del('prof-idem', adminToken()).expect(204);
    expect(mockPrisma.professional.update).toHaveBeenCalledTimes(1);
    expect(row.deletedAt).toBeInstanceOf(Date);

    await del('prof-idem', adminToken()).expect(204);
    expect(mockPrisma.professional.update).toHaveBeenCalledTimes(1);

    delete rows['prof-idem'];
  });

  it('11. race de archive (P2025 + re-check confirma arquivado) → 204 idempotente', async () => {
    // Pre-check vê deletedAt null; update condicional falha (corrida);
    // re-check vê a linha já arquivada por outrem → 204, sem escrever.
    const race = {
      id: 'prof-race',
      slug: 'race',
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      user: null,
    };
    mockPrisma.professional.findUnique
      .mockImplementationOnce(() => Promise.resolve({ ...race }))
      .mockImplementationOnce(() =>
        Promise.resolve({ ...race, deletedAt: new Date() }),
      );
    mockPrisma.professional.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Race', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    const res = await del('prof-race', adminToken()).expect(204);
    expect(res.text).toBe('');
    expect(mockPrisma.professional.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.professional.findUnique).toHaveBeenCalledTimes(2);
  });

  it('12. P2025 com re-check vazio (linha sumiu) → 404, nunca 204', async () => {
    mockPrisma.professional.findUnique
      .mockImplementationOnce(() => Promise.resolve({ ...rows['prof-active'] }))
      .mockImplementationOnce(() => Promise.resolve(null));
    mockPrisma.professional.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Race', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    await del('prof-active', adminToken()).expect(404);
  });

  it('13. corrida de status (P2025 no update condicional) → 409', async () => {
    mockPrisma.professional.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Race', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    await request(app.getHttpServer())
      .patch('/admin/professionals/prof-active/status')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'SUSPENDED' })
      .expect(409);
  });

  /*
   * ============================================================
   * LISTAGEM / GET / EDITION / STATUS — archived invisível
   * ============================================================
   */
  it('14. listagem passa deletedAt: null para findMany e count', async () => {
    await request(app.getHttpServer())
      .get('/admin/professionals')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    const listWhere = mockPrisma.professional.findMany.mock.calls[0][0].where;
    const countWhere = mockPrisma.professional.count.mock.calls[0][0].where;
    expect(listWhere).toEqual({ deletedAt: null });
    expect(countWhere).toEqual({ deletedAt: null });
  });

  it('15. search não faz archived escapar (deletedAt null + OR AND)', async () => {
    await request(app.getHttpServer())
      .get('/admin/professionals')
      .query({ search: 'ana' })
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    const where = mockPrisma.professional.findMany.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
    expect(where.OR).toBeDefined();
    expect(where.OR).toHaveLength(3);
  });

  it('16. paginação preservada junto com o filtro deletedAt', async () => {
    await request(app.getHttpServer())
      .get('/admin/professionals')
      .query({ limit: 5, offset: 10, search: 'x' })
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    const args = mockPrisma.professional.findMany.mock.calls[0][0];
    expect(args.take).toBe(5);
    expect(args.skip).toBe(10);
    expect(args.where.deletedAt).toBeNull();
    expect(args.where.OR).toBeDefined();
  });

  it('17. GET individual de archived → 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/professionals/prof-archived')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(404);
    expect(res.body.message).toBe('Profissional não encontrado.');
  });

  it('18. PATCH edit de archived → 404 (antes do precheck de User)', async () => {
    const res = await request(app.getHttpServer())
      .patch('/admin/professionals/prof-archived')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        name: 'X',
        slug: 'x',
        email: 'x@test.local',
        firstName: 'X',
        lastName: 'Y',
      })
      .expect(404);
    expect(res.body.message).toBe('Profissional não encontrado.');
    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });

  it('19. PATCH status de archived → 404 (restore NÃO é reativação)', async () => {
    const res = await request(app.getHttpServer())
      .patch('/admin/professionals/prof-archived/status')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'ACTIVE' })
      .expect(404);
    expect(res.body.message).toBe('Profissional não encontrado.');
    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });

  it('20. create com campo deletedAt no body → 400 (não controlável)', async () => {
    await request(app.getHttpServer())
      .post('/admin/professionals')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        name: 'Nova',
        slug: 'nova',
        email: 'nova@test.local',
        firstName: 'Nova',
        lastName: 'Pro',
        password: 'password123',
        deletedAt: '2026-10-26T00:00:00.000Z',
      })
      .expect(400);

    expect(mockPrisma.professional.create).not.toHaveBeenCalled();
  });

  it('21. status no-op continua sem escrita para não-arquivado', async () => {
    await request(app.getHttpServer())
      .patch('/admin/professionals/prof-active/status')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });

  it('22. edit em não-arquivado mantém o where condicional no update', async () => {
    mockPrisma.professional.update.mockImplementation((args: any) =>
      Promise.resolve({ ...(rows[args.where.id] ?? {}), ...(args.data ?? {}) }),
    );

    await request(app.getHttpServer())
      .patch('/admin/professionals/prof-active')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        name: 'Ana Pro',
        slug: 'ana',
        email: 'pro@test.local',
        firstName: 'Ana',
        lastName: 'Pro',
      })
      .expect(200);

    const args = lastUpdateArgs();
    expect(args.where).toEqual({ id: 'prof-active', deletedAt: null });
  });
});
