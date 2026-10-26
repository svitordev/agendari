import 'reflect-metadata';

/*
 * Segredo EXCLUSIVO deste teste — definido no processo do jest,
 * sem ler .env. Precisa existir antes do compile (requireJwtSecret).
 */
process.env.JWT_SECRET = 'admin-edit-professional-test-secret';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { Prisma } from '@prisma/client';

import { AdminModule } from './admin.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProfessionalsModule } from '../professionals/professionals.module';

/*
 * ============================================================
 * GET/PATCH /admin/professionals/:id — edição administrativa.
 *
 * Cadeia REAL: JwtAuthGuard → JwtStrategy → RolesGuard.
 * ValidationPipe REAL (mesmas opções do main.ts).
 * Prisma totalmente mockado — nenhum banco real.
 *
 * A atomicidade é propriedade do nested write do Prisma: os
 * testes provam a ESTRUTURA da chamada (uma única operação,
 * user.update aninhado, nenhum user.update separado) — não
 * afirmam rollback real do PostgreSQL.
 * ============================================================
 */
describe('GET/PATCH /admin/professionals/:id — edição ADMIN (mocks, sem banco)', () => {
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
      professional: { id: 'prof-1' },
    },
  };

  // Linhas vistas pelo service (professional.findUnique).
  // Shape do select aplicado pelo service — sem password.
  const rows: Record<string, any> = {
    'prof-1': {
      id: 'prof-1',
      name: 'Ana Pro',
      slug: 'ana',
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
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      user: null,
    },
  };

  // Shape retornado pelo Prisma no update com o select do service.
  const updatedFixture = () => ({
    id: 'prof-1',
    name: 'Ana Silva',
    slug: 'ana-silva',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    user: {
      id: 'user-pro',
      email: 'nova-email@test.local',
      firstName: 'Ana Clara',
      lastName: 'Souza',
      role: 'PROFESSIONAL',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    },
  });

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
      update: jest.fn(),
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

  const lastFindUniqueArgs = () =>
    mockPrisma.professional.findUnique.mock.calls[
      mockPrisma.professional.findUnique.mock.calls.length - 1
    ][0];

  const validBody = () => ({
    name: 'Ana Silva',
    slug: 'ana-silva',
    email: 'nova-email@test.local',
    firstName: 'Ana Clara',
    lastName: 'Souza',
  });

  const p2002 = (target: unknown) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed.', {
      code: 'P2002',
      clientVersion: '6.11.1',
      meta: { target },
    });

  const p2025 = () =>
    new Prisma.PrismaClientKnownRequestError(
      'An operation failed because it depends on one or more records that were required but not found. No existing record found for update on relation user.',
      {
        code: 'P2025',
        clientVersion: '6.11.1',
        meta: { target: 'user', modelName: 'Professional' },
      },
    );

  const getEdit = (id: string, token?: string) => {
    const req = request(app.getHttpServer()).get(`/admin/professionals/${id}`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
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
    mockPrisma.professional.update.mockReset().mockResolvedValue(updatedFixture());
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
   * GET /admin/professionals/:id
   * ============================================================
   */
  it('1. GET ADMIN válido → 200 com shape { professional, user }', async () => {
    const res = await getEdit('prof-1', adminToken()).expect(200);

    expect(Object.keys(res.body).sort()).toEqual(['professional', 'user']);
    expect(res.body.professional.id).toBe('prof-1');
    expect(res.body.user.role).toBe('PROFESSIONAL');
  });

  it('2. GET sem JWT → 401', async () => {
    await getEdit('prof-1').expect(401);
  });

  it('3. GET com PROFESSIONAL → 403', async () => {
    await getEdit('prof-1', proToken()).expect(403);
  });

  it('4. GET id inexistente → 404', async () => {
    const res = await getEdit('nao-existe', adminToken()).expect(404);
    expect(res.body.message).toBe('Profissional não encontrado.');
  });

  it('5. GET Professional sem User → 200 com user null (tela trata)', async () => {
    const res = await getEdit('prof-nouser', adminToken()).expect(200);

    expect(res.body.professional.id).toBe('prof-nouser');
    expect(res.body.user).toBeNull();
  });

  it('6. GET response não contém password', async () => {
    const res = await getEdit('prof-1', adminToken()).expect(200);

    expect(JSON.stringify(res.body)).not.toContain('password');
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('7. select do Prisma no GET não inclui password', async () => {
    await getEdit('prof-1', adminToken()).expect(200);

    const select = lastFindUniqueArgs().select;
    expect(select).not.toHaveProperty('password');
    expect(select.user.select).not.toHaveProperty('password');
  });

  /*
   * ============================================================
   * PATCH /admin/professionals/:id
   * ============================================================
   */
  it('8. PATCH ADMIN válido → 200 com shape { professional, user }', async () => {
    const res = await patchEdit('prof-1', validBody(), adminToken()).expect(200);

    expect(Object.keys(res.body).sort()).toEqual(['professional', 'user']);
    expect(res.body.professional.slug).toBe('ana-silva');
    expect(res.body.user.email).toBe('nova-email@test.local');
  });

  it('9. PATCH sem JWT → 401', async () => {
    await patchEdit('prof-1', validBody()).expect(401);
  });

  it('10. PATCH com PROFESSIONAL → 403', async () => {
    await patchEdit('prof-1', validBody(), proToken()).expect(403);
  });

  it('11. PATCH id inexistente → 404 sem escrita', async () => {
    const res = await patchEdit('nao-existe', validBody(), adminToken()).expect(404);

    expect(res.body.message).toBe('Profissional não encontrado.');
    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });

  it('12. PATCH Professional sem User → 409 seguro e nenhuma escrita', async () => {
    const res = await patchEdit('prof-nouser', validBody(), adminToken()).expect(409);

    expect(res.body.message).toBe('Este profissional não possui usuário associado.');
    expect(mockPrisma.professional.update).not.toHaveBeenCalled();
  });

  it('13. name e slug vão ao Prisma no nível do Professional', async () => {
    await patchEdit('prof-1', validBody(), adminToken()).expect(200);

    expect(lastUpdateArgs().where).toEqual({ id: 'prof-1', deletedAt: null });
    expect(lastUpdateArgs().data.name).toBe('Ana Silva');
    expect(lastUpdateArgs().data.slug).toBe('ana-silva');
  });

  it('14. email/firstName/lastName vão ao Prisma via user.update aninhado', async () => {
    await patchEdit('prof-1', validBody(), adminToken()).expect(200);

    const nested = lastUpdateArgs().data.user.update;
    expect(nested.email).toBe('nova-email@test.local');
    expect(nested.firstName).toBe('Ana Clara');
    expect(nested.lastName).toBe('Souza');
  });

  it('15. edição usa UMA única operação Prisma com user.update aninhado', async () => {
    await patchEdit('prof-1', validBody(), adminToken()).expect(200);

    expect(mockPrisma.professional.update).toHaveBeenCalledTimes(1);
    expect(lastUpdateArgs().data.user).toHaveProperty('update');
  });

  it('16. NÃO existe prisma.user.update separado', async () => {
    await patchEdit('prof-1', validBody(), adminToken()).expect(200);

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('17. password não vai ao Prisma no data do update', async () => {
    await patchEdit('prof-1', validBody(), adminToken()).expect(200);

    expect(lastUpdateArgs().data).not.toHaveProperty('password');
    expect(lastUpdateArgs().data.user.update).not.toHaveProperty('password');
  });

  it('18. role não vai ao Prisma no data do update', async () => {
    await patchEdit('prof-1', validBody(), adminToken()).expect(200);

    expect(lastUpdateArgs().data).not.toHaveProperty('role');
    expect(lastUpdateArgs().data.user.update).not.toHaveProperty('role');
  });

  it('19. PATCH response não contém password', async () => {
    const res = await patchEdit('prof-1', validBody(), adminToken()).expect(200);

    expect(JSON.stringify(res.body)).not.toContain('password');
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('20. select do Prisma no update não inclui password', async () => {
    await patchEdit('prof-1', validBody(), adminToken()).expect(200);

    const select = lastUpdateArgs().select;
    expect(select).not.toHaveProperty('password');
    expect(select.user.select).not.toHaveProperty('password');
  });

  /*
   * ============================================================
   * Validação (forbidNonWhitelisted + decorators do DTO)
   * ============================================================
   */
  it('21. role no body → 400 (fora do whitelist)', async () => {
    await patchEdit('prof-1', { ...validBody(), role: 'ADMIN' }, adminToken()).expect(400);
  });

  it('22. password no body → 400', async () => {
    await patchEdit('prof-1', { ...validBody(), password: 'qualquer-coisa' }, adminToken()).expect(400);
  });

  it('23. professionalId no body → 400', async () => {
    await patchEdit('prof-1', { ...validBody(), professionalId: 'x' }, adminToken()).expect(400);
  });

  it('24. userId no body → 400', async () => {
    await patchEdit('prof-1', { ...validBody(), userId: 'x' }, adminToken()).expect(400);
  });

  it('25. id/createdAt/updatedAt no body → 400', async () => {
    await patchEdit(
      'prof-1',
      { ...validBody(), id: 'x', createdAt: '2026-01-01', updatedAt: '2026-01-02' },
      adminToken(),
    ).expect(400);
  });

  it('26. email inválido → 400', async () => {
    await patchEdit('prof-1', { ...validBody(), email: 'nao-e-email' }, adminToken()).expect(400);
  });

  it('27. slug inválido (maiúsculas/espaço) → 400', async () => {
    await patchEdit('prof-1', { ...validBody(), slug: 'Slug Invalido' }, adminToken()).expect(400);
  });

  it('28. campo obrigatório ausente → 400', async () => {
    const body = validBody();
    delete (body as any).lastName;

    await patchEdit('prof-1', body, adminToken()).expect(400);
  });

  /*
   * ============================================================
   * Conflitos (constraints do banco como autoridade)
   * ============================================================
   */
  it('29. P2002 em email → 409 com mensagem segura', async () => {
    mockPrisma.professional.update.mockRejectedValueOnce(p2002('email'));

    const res = await patchEdit('prof-1', validBody(), adminToken()).expect(409);
    expect(res.body.message).toBe('E-mail já cadastrado.');
  });

  it('30. P2002 em slug (target array) → 409 com mensagem segura', async () => {
    mockPrisma.professional.update.mockRejectedValueOnce(p2002(['slug']));

    const res = await patchEdit('prof-1', validBody(), adminToken()).expect(409);
    expect(res.body.message).toBe('Slug já cadastrado.');
  });

  it('31. P2002 com target desconhecido → 409 genérico', async () => {
    mockPrisma.professional.update.mockRejectedValueOnce(p2002(['some_other_field']));

    const res = await patchEdit('prof-1', validBody(), adminToken()).expect(409);
    expect(res.body.message).toBe('Já existe um cadastro com esses dados.');
  });

  it('32. erro não-P2002/P2025 não é mascarado como ConflictException', async () => {
    mockPrisma.professional.update.mockRejectedValueOnce(new Error('boom'));

    // Erro inesperado segue o tratamento normal do Nest → 500.
    await patchEdit('prof-1', validBody(), adminToken()).expect(500);
  });

  it('33. P2025 residual (corrida) → 409 genérico sem afirmar causa', async () => {
    // Pre-check passou (prof-1 tem User); P2025 só pode ser
    // corrida — causa não distinguível de forma robusta, então
    // a resposta é genérica e não afirma User ausente.
    mockPrisma.professional.update.mockRejectedValueOnce(p2025());

    const res = await patchEdit('prof-1', validBody(), adminToken()).expect(409);

    expect(res.body.message).toBe(
      'O cadastro foi alterado durante a operação. Recarregue e tente novamente.',
    );
    expect(res.body.message).not.toContain('usuário');
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('P2025');
    expect(raw).not.toContain('P2002');
    expect(raw).not.toContain('clientVersion');
  });

  /*
   * ============================================================
   * Regressão — rotas admin existentes seguem intactas
   * ============================================================
   */
  it('34. GET /admin/me continua funcionando', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/me')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(res.body.role).toBe('ADMIN');
    expect(res.body.email).toBe('admin@test.local');
  });

  it('35. GET /admin/professionals (listagem) continua funcionando', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/professionals')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(Object.keys(res.body).sort()).toEqual(['items', 'limit', 'offset', 'total']);
  });

  it('36. POST /admin/professionals (criação) continua funcionando', async () => {
    mockPrisma.professional.create.mockResolvedValue({
      id: 'prof-new',
      slug: 'nova-prof',
      name: 'Nova Profissional',
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

    expect(res.body.user.role).toBe('PROFESSIONAL');
  });
});
