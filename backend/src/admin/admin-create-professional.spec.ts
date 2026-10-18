import 'reflect-metadata';

/*
 * Segredo EXCLUSIVO deste teste — definido no processo do jest,
 * sem ler .env. Precisa existir antes do compile (requireJwtSecret).
 */
process.env.JWT_SECRET = 'admin-create-professional-test-secret';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { Prisma } from '@prisma/client';

import { AdminModule } from './admin.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProfessionalsModule } from '../professionals/professionals.module';

/*
 * ============================================================
 * POST /admin/professionals — criação atômica (nested write).
 *
 * Cadeia REAL: JwtAuthGuard → JwtStrategy → RolesGuard.
 * ValidationPipe REAL (mesmas opções do main.ts).
 * Prisma totalmente mockado — nenhum banco real.
 *
 * A atomicidade é propriedade do nested write do Prisma: os
 * testes provam a ESTRUTURA da chamada (uma única operação,
 * user.create aninhado, nenhum user.create separado) — não
 * afirmam rollback real do PostgreSQL.
 * ============================================================
 */
describe('POST /admin/professionals — criação ADMIN (mocks, sem banco)', () => {
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
  ];

  // Shape retornado pelo Prisma quando o select do service é aplicado.
  const createdFixture = () => ({
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

  const mockPrisma = {
    user: {
      findUnique: jest.fn(({ where }: any) => {
        const key = where.id ?? where.email;
        return Promise.resolve(users[key] ?? null);
      }),
      create: jest.fn(),
    },
    professional: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
  };

  const adminToken = () =>
    jwtService.sign({ sub: 'user-admin', email: 'admin@test.local' });
  const proToken = () =>
    jwtService.sign({ sub: 'user-pro', email: 'pro@test.local' });

  const lastCreateArgs = () =>
    mockPrisma.professional.create.mock.calls[
      mockPrisma.professional.create.mock.calls.length - 1
    ][0];

  const validBody = () => ({
    name: 'Nova Profissional',
    slug: 'nova-prof',
    email: 'nova@test.local',
    firstName: 'Nova',
    lastName: 'Pro',
    password: 'senha-forte-123',
  });

  const p2002 = (target: unknown) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed.', {
      code: 'P2002',
      clientVersion: '6.11.1',
      meta: { target },
    });

  const postCreate = (body: Record<string, unknown>, token?: string) => {
    const req = request(app.getHttpServer()).post('/admin/professionals');
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
    mockPrisma.professional.create.mockReset().mockResolvedValue(createdFixture());
    mockPrisma.user.create.mockReset();
    mockPrisma.professional.findMany.mockReset().mockResolvedValue(itemsFixture);
    mockPrisma.professional.count.mockReset().mockResolvedValue(1);
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. ADMIN válido → 201 com shape { professional, user }', async () => {
    const res = await postCreate(validBody(), adminToken()).expect(201);

    expect(Object.keys(res.body).sort()).toEqual(['professional', 'user']);
    expect(res.body.professional.id).toBe('prof-new');
    expect(res.body.user.role).toBe('PROFESSIONAL');
    expect(res.body.user.professionalId).toBe('prof-new');
  });

  it('2. sem JWT → 401', async () => {
    await postCreate(validBody()).expect(401);
  });

  it('3. PROFESSIONAL → 403', async () => {
    await postCreate(validBody(), proToken()).expect(403);
  });

  it('4. DTO válido chega ao Prisma com name/slug do body', async () => {
    await postCreate(validBody(), adminToken()).expect(201);

    expect(lastCreateArgs().data.name).toBe('Nova Profissional');
    expect(lastCreateArgs().data.slug).toBe('nova-prof');
  });

  it('5. role enviada ao Prisma é SEMPRE PROFESSIONAL', async () => {
    await postCreate(validBody(), adminToken()).expect(201);

    expect(lastCreateArgs().data.user.create.role).toBe('PROFESSIONAL');
  });

  it('6. User é criado aninhado via relação (sem professionalId do cliente)', async () => {
    await postCreate(validBody(), adminToken()).expect(201);

    const nested = lastCreateArgs().data.user.create;
    expect(nested.email).toBe('nova@test.local');
    expect(nested.firstName).toBe('Nova');
    expect(nested.lastName).toBe('Pro');
    // A associação é criada pela relação — nunca por id enviado pelo cliente.
    expect(nested).not.toHaveProperty('professionalId');
  });

  it('7. password enviado ao Prisma está hashed (bcrypt real)', async () => {
    await postCreate(validBody(), adminToken()).expect(201);

    const sent = lastCreateArgs().data.user.create.password;
    expect(bcrypt.compareSync('senha-forte-123', sent)).toBe(true);
  });

  it('8. hash enviado é diferente do plaintext', async () => {
    await postCreate(validBody(), adminToken()).expect(201);

    expect(lastCreateArgs().data.user.create.password).not.toBe('senha-forte-123');
  });

  it('9. password não aparece na resposta', async () => {
    const res = await postCreate(validBody(), adminToken()).expect(201);

    expect(JSON.stringify(res.body)).not.toContain('password');
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('10. select do Prisma não inclui password', async () => {
    await postCreate(validBody(), adminToken()).expect(201);

    const select = lastCreateArgs().select;
    expect(select).not.toHaveProperty('password');
    expect(select.user.select).not.toHaveProperty('password');
  });

  it('11. role no body → 400 (fora do whitelist)', async () => {
    await postCreate({ ...validBody(), role: 'ADMIN' }, adminToken()).expect(400);
  });

  it('12. professionalId no body → 400', async () => {
    await postCreate({ ...validBody(), professionalId: 'x' }, adminToken()).expect(400);
  });

  it('13. id/createdAt/updatedAt no body → 400', async () => {
    await postCreate(
      { ...validBody(), id: 'x', createdAt: '2026-01-01', updatedAt: '2026-01-02' },
      adminToken(),
    ).expect(400);
  });

  it('14. senha curta (7 chars) → 400', async () => {
    await postCreate({ ...validBody(), password: 'abc1234' }, adminToken()).expect(400);
  });

  it('15. email inválido → 400', async () => {
    await postCreate({ ...validBody(), email: 'nao-e-email' }, adminToken()).expect(400);
  });

  it('16. slug inválido (maiúsculas/espaço) → 400', async () => {
    await postCreate({ ...validBody(), slug: 'Slug Invalido' }, adminToken()).expect(400);
  });

  it('17. P2002 em email → 409 com mensagem segura', async () => {
    mockPrisma.professional.create.mockRejectedValueOnce(p2002('email'));

    const res = await postCreate(validBody(), adminToken()).expect(409);
    expect(res.body.message).toBe('E-mail já cadastrado.');
  });

  it('18. P2002 em slug (target array) → 409 com mensagem segura', async () => {
    mockPrisma.professional.create.mockRejectedValueOnce(p2002(['slug']));

    const res = await postCreate(validBody(), adminToken()).expect(409);
    expect(res.body.message).toBe('Slug já cadastrado.');
  });

  it('19. P2002 com target desconhecido → 409 genérico', async () => {
    mockPrisma.professional.create.mockRejectedValueOnce(p2002(['some_other_field']));

    const res = await postCreate(validBody(), adminToken()).expect(409);
    expect(res.body.message).toBe('Já existe um cadastro com esses dados.');
  });

  it('20. erro não-P2002 não é mascarado como ConflictException', async () => {
    mockPrisma.professional.create.mockRejectedValueOnce(new Error('boom'));

    // Erro inesperado segue o tratamento normal do Nest → 500.
    await postCreate(validBody(), adminToken()).expect(500);
  });

  it('21. criação usa UMA única operação Prisma com user.create aninhado', async () => {
    await postCreate(validBody(), adminToken()).expect(201);

    expect(mockPrisma.professional.create).toHaveBeenCalledTimes(1);
    expect(lastCreateArgs().data.user).toHaveProperty('create');
  });

  it('22. NÃO existe prisma.user.create separado', async () => {
    await postCreate(validBody(), adminToken()).expect(201);

    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('23. GET /admin/professionals continua funcionando', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/professionals')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(Object.keys(res.body).sort()).toEqual(['items', 'limit', 'offset', 'total']);
  });

  it('24. GET /admin/me continua funcionando', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/me')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(res.body.role).toBe('ADMIN');
    expect(res.body.email).toBe('admin@test.local');
  });

  it('25. rota pública GET /professionals permanece intacta', async () => {
    const res = await request(app.getHttpServer()).get('/professionals').expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });
});
