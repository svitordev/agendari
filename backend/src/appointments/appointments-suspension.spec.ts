import 'reflect-metadata';

/*
 * Segredo EXCLUSIVO deste teste — definido no processo do jest,
 * sem ler .env (o AuthModule é carregado pela cadeia de módulos).
 */
process.env.JWT_SECRET = 'appointments-suspension-test-secret';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { AppointmentsModule } from './appointments.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/*
 * ============================================================
 * Suspensão no fluxo PÚBLICO — backend é a autoridade.
 *
 * Professional suspenso: não aceita novo agendamento (403) e
 * não mostra slots (lista vazia no shape já esperado).
 *
 * O que continua intacto: appointments existentes, consulta
 * pública por telefone e cancelamento público — suspensão não
 * cancela histórico nem pune o cliente.
 *
 * Prisma totalmente mockado — nenhum banco real.
 * ============================================================
 */
describe('Suspensão — booking público e perfil público (mocks, sem banco)', () => {
  let app: INestApplication;

  // 13:00Z = 10:00 no fuso local (UTC-3) — dentro do período 08:00–18:00.
  const FUTURE = '2027-06-15T13:00:00.000Z';

  const profActive = {
    id: 'prof-active',
    slug: 'ativa',
    name: 'Ativa Pro',
    status: 'ACTIVE',
  };

  const profSusp = {
    id: 'prof-susp',
    slug: 'suspensa',
    name: 'Suspensa Pro',
    status: 'SUSPENDED',
  };

  const byId: Record<string, any> = {
    'prof-active': profActive,
    'prof-susp': profSusp,
  };
  const bySlug: Record<string, any> = {
    ativa: profActive,
    suspensa: profSusp,
  };

  const serviceFixture = {
    id: 'srv-1',
    name: 'Alongamento',
    durationMinutes: 60,
    price: 100,
    isActive: true,
  };

  const availabilityFixture = {
    id: 'av-1',
    dayOfWeek: 2,
    isActive: true,
    periods: [{ id: 'ap-1', startTime: '08:00', endTime: '18:00' }],
  };

  const customerFixture = { id: 'cust-1', name: 'Cliente Teste', phone: '11999998888' };

  const appointmentFixture = {
    id: 'appt-1',
    date: new Date('2027-06-15T10:00:00.000Z'),
    status: 'CONFIRMED',
    professional: profSusp,
    service: serviceFixture,
    customer: customerFixture,
  };

  const appointmentForCancel = {
    id: 'appt-2',
    date: new Date('2027-06-16T10:00:00.000Z'),
    status: 'PENDING',
    customer: { id: 'cust-2', name: 'Outro Cliente', phone: '11988887777' },
  };

  const mockPrisma = {
    professional: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve((where.id ? byId[where.id] : bySlug[where.slug]) ?? null),
      ),
      findMany: jest.fn(),
    },
    service: {
      findFirst: jest.fn().mockResolvedValue(serviceFixture),
    },
    availability: {
      findUnique: jest.fn().mockResolvedValue(availabilityFixture),
    },
    availabilityException: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    customer: {
      findMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(customerFixture),
      create: jest.fn(),
    },
    appointment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const validBookingBody = (professionalId: string) => ({
    professionalId,
    serviceId: 'srv-1',
    dateTime: FUTURE,
    clientName: 'Cliente Teste',
    clientWhats: '11999998888',
  });

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, AppointmentsModule, ProfessionalsModule],
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
  });

  beforeEach(() => {
    mockPrisma.professional.findMany.mockReset().mockResolvedValue([profActive, profSusp]);
    mockPrisma.service.findFirst.mockReset().mockResolvedValue(serviceFixture);
    mockPrisma.availability.findUnique.mockReset().mockResolvedValue(availabilityFixture);
    mockPrisma.availabilityException.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.customer.findMany.mockReset().mockResolvedValue([customerFixture]);
    mockPrisma.customer.findFirst.mockReset().mockResolvedValue(customerFixture);
    mockPrisma.customer.create.mockReset();
    mockPrisma.appointment.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.appointment.findFirst.mockReset();
    mockPrisma.appointment.findUnique.mockReset().mockResolvedValue(appointmentForCancel);
    mockPrisma.appointment.create.mockReset().mockResolvedValue({ id: 'appt-new' });
    mockPrisma.appointment.update.mockReset().mockResolvedValue({
      ...appointmentForCancel,
      status: 'CANCELLED',
    });
    mockPrisma.appointment.delete.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  /*
   * ============================================================
   * NOVO AGENDAMENTO (POST público)
   * ============================================================
   */
  it('35. POST appointment para ACTIVE continua funcionando', async () => {
    const res = await request(app.getHttpServer())
      .post('/appointments')
      .send(validBookingBody('prof-active'))
      .expect(201);

    expect(res.body.id).toBe('appt-new');
    expect(mockPrisma.appointment.create).toHaveBeenCalledTimes(1);
  });

  it('36. POST appointment para SUSPENDED → 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/appointments')
      .send(validBookingBody('prof-susp'))
      .expect(403);

    expect(res.body.message).toBe(
      'Este profissional não está aceitando novos agendamentos no momento.',
    );
  });

  it('37. ZERO prisma.appointment.create quando suspenso', async () => {
    await request(app.getHttpServer())
      .post('/appointments')
      .send(validBookingBody('prof-susp'))
      .expect(403);

    expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
  });

  it('38. mensagem segura correta (sem internals) no bloqueio', async () => {
    const res = await request(app.getHttpServer())
      .post('/appointments')
      .send(validBookingBody('prof-susp'))
      .expect(403);

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('P2002');
    expect(raw).not.toContain('clientVersion');
    expect(raw).not.toContain('meta');
  });

  it('39. available slots para ACTIVE mantém comportamento atual', async () => {
    const res = await request(app.getHttpServer())
      .get('/appointments/available')
      .query({ date: '2027-06-15', professionalId: 'prof-active', serviceId: 'srv-1' })
      .expect(200);

    expect(res.body.slots.length).toBeGreaterThan(0);
    expect(res.body.service.id).toBe('srv-1');
  });

  it('40. available slots para SUSPENDED → lista vazia no shape esperado', async () => {
    const res = await request(app.getHttpServer())
      .get('/appointments/available')
      .query({ date: '2027-06-15', professionalId: 'prof-susp', serviceId: 'srv-1' })
      .expect(200);

    expect(res.body.available).toBe(false);
    expect(res.body.slots).toEqual([]);
  });

  it('41. appointments existentes não são alterados pelos fluxos de suspensão', async () => {
    await request(app.getHttpServer())
      .post('/appointments')
      .send(validBookingBody('prof-susp'))
      .expect(403);
    await request(app.getHttpServer())
      .get('/appointments/available')
      .query({ date: '2027-06-15', professionalId: 'prof-susp', serviceId: 'srv-1' })
      .expect(200);

    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
    expect(mockPrisma.appointment.delete).not.toHaveBeenCalled();
    expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
  });

  it('42. by-phone NÃO é bloqueado pela suspensão (histórico do cliente intacto)', async () => {
    mockPrisma.appointment.findMany.mockResolvedValueOnce([appointmentFixture]);

    const res = await request(app.getHttpServer())
      .get('/appointments/by-phone')
      .query({ phone: '11999998888' })
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('appt-1');
  });

  it('43. cancel-public NÃO é bloqueado pela suspensão', async () => {
    const res = await request(app.getHttpServer())
      .patch('/appointments/appt-2/cancel-public')
      .send({ phone: '11988887777' })
      .expect(200);

    expect(res.body.status).toBe('CANCELLED');
    expect(mockPrisma.appointment.update).toHaveBeenCalledTimes(1);
  });

  /*
   * ============================================================
   * PERFIL PÚBLICO — continua visível, agora expondo status
   * ============================================================
   */
  it('44. listagem pública inclui status', async () => {
    const res = await request(app.getHttpServer())
      .get('/professionals')
      .expect(200);

    expect(res.body[0].status).toBe('ACTIVE');
    expect(res.body[1].status).toBe('SUSPENDED');
  });

  it('45. perfil público por slug inclui status', async () => {
    const res = await request(app.getHttpServer())
      .get('/professionals/slug/suspensa')
      .expect(200);

    expect(res.body.status).toBe('SUSPENDED');
  });

  it('46. perfil SUSPENSO continua consultável (200, não 404)', async () => {
    const res = await request(app.getHttpServer())
      .get('/professionals/slug/suspensa')
      .expect(200);

    expect(res.body.slug).toBe('suspensa');
  });

  it('47. perfil ATIVO continua consultável', async () => {
    const res = await request(app.getHttpServer())
      .get('/professionals/slug/ativa')
      .expect(200);

    expect(res.body.slug).toBe('ativa');
    expect(res.body.status).toBe('ACTIVE');
  });
});
