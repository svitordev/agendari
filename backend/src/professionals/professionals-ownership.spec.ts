import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { ProfessionalsController } from './professionals.controller';
import { ProfessionalsService } from './professionals.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

/*
 * ============================================================
 * SEC-001 — GET /professionals/:id com verificação de ownership.
 * Controller real + Service real + Prisma mockado + Guard mockado.
 * Nenhum banco real é acessado.
 * ============================================================
 */
describe('SEC-001 — GET /professionals/:id ownership', () => {
  let app: INestApplication;

  let guardAllowed: boolean;
  let guardCalled: boolean;
  let guardUser: { professionalId?: string } | undefined;

  const mockPrisma = {
    professional: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const guardMock = {
    canActivate: jest.fn((ctx: any) => {
      guardCalled = true;
      if (!guardAllowed) {
        return false;
      }
      ctx.switchToHttp().getRequest().user = guardUser;
      return true;
    }),
  };

  const professionalA = { id: 'pro-aaa', slug: 'profissional-a', user: null };
  const professionalB = { id: 'pro-bbb', slug: 'profissional-b', user: null };

  beforeEach(async () => {
    jest.clearAllMocks();
    guardAllowed = true;
    guardCalled = false;
    guardUser = undefined;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfessionalsController],
      providers: [
        ProfessionalsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(guardMock)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('1. profissional autenticado acessa o próprio id → 200', async () => {
    guardUser = { professionalId: 'pro-aaa' };
    mockPrisma.professional.findUnique.mockResolvedValue(professionalA);

    const res = await request(app.getHttpServer())
      .get('/professionals/pro-aaa')
      .expect(200);

    expect(res.body.id).toBe('pro-aaa');
    expect(mockPrisma.professional.findUnique).toHaveBeenCalled();
  });

  it('2. profissional autenticado tenta outro professionalId → 404 (cross-tenant)', async () => {
    guardUser = { professionalId: 'pro-aaa' };
    mockPrisma.professional.findUnique.mockResolvedValue(professionalB);

    await request(app.getHttpServer())
      .get('/professionals/pro-bbb')
      .expect(404);

    /*
     * Bloqueado antes de tocar no banco: nada é retornado sobre o tenant B.
     */
    expect(mockPrisma.professional.findUnique).not.toHaveBeenCalled();
  });

  it('3. ausência de professionalId autenticado → 403', async () => {
    guardUser = {};

    await request(app.getHttpServer())
      .get('/professionals/pro-aaa')
      .expect(403);

    expect(mockPrisma.professional.findUnique).not.toHaveBeenCalled();
  });

  it('4. rota continua protegida pelo JwtAuthGuard', async () => {
    guardAllowed = false;

    /*
     * Guard negando acesso, o Nest responde 403 (Forbidden).
     */
    await request(app.getHttpServer())
      .get('/professionals/pro-aaa')
      .expect(403);

    expect(guardCalled).toBe(true);
    expect(mockPrisma.professional.findUnique).not.toHaveBeenCalled();
  });

  it('5a. rota pública /professionals/slug/:slug continua funcionando sem guard', async () => {
    mockPrisma.professional.findUnique.mockResolvedValue(professionalA);

    await request(app.getHttpServer())
      .get('/professionals/slug/profissional-a')
      .expect(200);

    expect(guardCalled).toBe(false);
  });

  it('5b. rota pública /professionals continua funcionando sem guard', async () => {
    mockPrisma.professional.findMany.mockResolvedValue([professionalA]);

    await request(app.getHttpServer()).get('/professionals').expect(200);

    expect(guardCalled).toBe(false);
  });
});
