import 'reflect-metadata';

/*
 * Segredo EXCLUSIVO deste teste — definido no processo do jest,
 * sem ler .env (o AuthModule é carregado pela cadeia de módulos).
 */
process.env.JWT_SECRET = 'appointments-archived-test-secret';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { AppointmentsModule } from './appointments.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { ServicesModule } from '../services/services.module';
import { AvailabilitiesModule } from '../availabilities/availabilities.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/*
 * ============================================================
 * Arquivamento no fluxo PÚBLICO — backend é a autoridade.
 *
 * Professional arquivado: some da listagem pública (filtro
 * deletedAt null), página por slug → 404, services/availability
 * públicos não produzem nada utilizável (lista vazia no shape
 * atual), novo booking → 403 com mensagem própria (arquivamento
 * tem prioridade sobre suspensão), available → indisponível.
 *
 * O que continua intacto: appointments existentes, by-phone e
 * cancel-public — arquivamento não cancela histórico nem pune o
 * cliente. Nenhuma linha é apagada (soft delete).
 *
 * Prisma totalmente mockado — nenhum banco real.
 * ============================================================
 */
describe('Arquivamento — fluxo público (mocks, sem banco)', () => {
  let app: INestApplication;

  // 13:00Z = 10:00 no fuso local (UTC-3) — dentro do período 08:00–18:00.
  const FUTURE = '2027-06-15T13:00:00.000Z';
  const ARCHIVED_AT = new Date('2026-10-20T12:00:00.000Z');

  const ARCHIVED_MESSAGE =
    'Este profissional não está disponível para novos agendamentos.';

  const profActive = {
    id: 'prof-active',
    slug: 'ativa',
    name: 'Ativa Pro',
    status: 'ACTIVE',
    deletedAt: null,
  };

  const profSusp = {
    id: 'prof-susp',
    slug: 'suspensa',
    name: 'Suspensa Pro',
    status: 'SUSPENDED',
    deletedAt: null,
  };

  const profArch = {
    id: 'prof-arch',
    slug: 'arquivada',
    name: 'Arquivada Pro',
    status: 'ACTIVE',
    deletedAt: ARCHIVED_AT,
  };

  const profArchSusp = {
    id: 'prof-arch-susp',
    slug: 'arq-susp',
    name: 'Arq Susp Pro',
    status: 'SUSPENDED',
    deletedAt: ARCHIVED_AT,
  };

  const byId: Record<string, any> = {
    'prof-active': profActive,
    'prof-susp': profSusp,
    'prof-arch': profArch,
    'prof-arch-susp': profArchSusp,
  };
  const bySlug: Record<string, any> = {
    ativa: profActive,
    suspensa: profSusp,
    arquivada: profArch,
    'arq-susp': profArchSusp,
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

  // Appointment existente de um Professional ARQUIVADO — continua
  // consultável/cancelável pelo cliente (histórico preservado).
  const appointmentFixture = {
    id: 'appt-1',
    date: new Date('2027-06-15T10:00:00.000Z'),
    status: 'CONFIRMED',
    professional: profArch,
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
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    availability: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    availabilityException: {
      findMany: jest.fn(),
    },
    customer: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
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
      imports: [
        PrismaModule,
        AppointmentsModule,
        ProfessionalsModule,
        ServicesModule,
        AvailabilitiesModule,
      ],
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
    mockPrisma.professional.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.service.findFirst.mockReset().mockResolvedValue(serviceFixture);
    mockPrisma.service.findMany.mockReset().mockResolvedValue([serviceFixture]);
    mockPrisma.availability.findUnique.mockReset().mockResolvedValue(availabilityFixture);
    mockPrisma.availability.findMany.mockReset().mockResolvedValue([availabilityFixture]);
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
   * LISTA PÚBLICA / SLUG
   * ============================================================
   */
  it('1. listagem pública filtra archived (where deletedAt null)', async () => {
    await request(app.getHttpServer()).get('/professionals').expect(200);

    const args = mockPrisma.professional.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ deletedAt: null });
  });

  it('2. slug de arquivada → 404 (página sai do ar; slug reservado)', async () => {
    await request(app.getHttpServer())
      .get('/professionals/slug/arquivada')
      .expect(404);
  });

  it('3. slug ATIVO continua consultável (regressão)', async () => {
    const res = await request(app.getHttpServer())
      .get('/professionals/slug/ativa')
      .expect(200);

    expect(res.body.slug).toBe('ativa');
  });

  it('4. slug SUSPENSO não-arquivado continua consultável (regressão)', async () => {
    const res = await request(app.getHttpServer())
      .get('/professionals/slug/suspensa')
      .expect(200);

    expect(res.body.slug).toBe('suspensa');
  });

  /*
   * ============================================================
   * SERVICES / AVAILABILITY PÚBLICOS
   * ============================================================
   */
  it('5. services públicos de arquivada → lista vazia (shape preservado)', async () => {
    const res = await request(app.getHttpServer())
      .get('/services/professional/prof-arch')
      .expect(200);

    expect(res.body).toEqual([]);
    expect(mockPrisma.service.findMany).not.toHaveBeenCalled();
  });

  it('6. services públicos de ACTIVE continuam normais (regressão)', async () => {
    const res = await request(app.getHttpServer())
      .get('/services/professional/prof-active')
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(mockPrisma.service.findMany).toHaveBeenCalled();
  });

  it('7. availability pública de arquivada → lista vazia (nada apagado)', async () => {
    const res = await request(app.getHttpServer())
      .get('/availabilities/professional/prof-arch')
      .expect(200);

    expect(res.body).toEqual([]);
    expect(mockPrisma.availability.findMany).not.toHaveBeenCalled();
  });

  /*
   * ============================================================
   * NOVO BOOKING (POST público)
   * ============================================================
   */
  it('8. POST appointment para arquivada → 403 com mensagem própria', async () => {
    const res = await request(app.getHttpServer())
      .post('/appointments')
      .send(validBookingBody('prof-arch'))
      .expect(403);

    expect(res.body.message).toBe(ARCHIVED_MESSAGE);
  });

  it('9. POST para arquivada+SUSPENSA → mensagem de arquivamento (prioridade)', async () => {
    const res = await request(app.getHttpServer())
      .post('/appointments')
      .send(validBookingBody('prof-arch-susp'))
      .expect(403);

    expect(res.body.message).toBe(ARCHIVED_MESSAGE);
  });

  it('10. ZERO prisma.appointment.create para arquivada', async () => {
    await request(app.getHttpServer())
      .post('/appointments')
      .send(validBookingBody('prof-arch'))
      .expect(403);

    expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
  });

  it('11. available slots de arquivada → indisponível no shape atual', async () => {
    const res = await request(app.getHttpServer())
      .get('/appointments/available')
      .query({ date: '2027-06-15', professionalId: 'prof-arch', serviceId: 'srv-1' })
      .expect(200);

    expect(res.body.available).toBe(false);
    expect(res.body.slots).toEqual([]);
    expect(res.body.message).toBe(ARCHIVED_MESSAGE);
  });

  /*
   * ============================================================
   * HISTÓRICO DO CLIENTE — intacto
   * ============================================================
   */
  it('12. by-phone de appointment existente com professional arquivada funciona', async () => {
    mockPrisma.appointment.findMany.mockResolvedValueOnce([appointmentFixture]);

    const res = await request(app.getHttpServer())
      .get('/appointments/by-phone')
      .query({ phone: '11999998888' })
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('appt-1');
  });

  it('13. cancel-public de appointment existente com professional arquivada funciona', async () => {
    const res = await request(app.getHttpServer())
      .patch('/appointments/appt-2/cancel-public')
      .send({ phone: '11988887777' })
      .expect(200);

    expect(res.body.status).toBe('CANCELLED');
    expect(mockPrisma.appointment.update).toHaveBeenCalledTimes(1);
  });

  /*
   * ============================================================
   * LEAK — deletedAt não pode aparecer em response pública
   * ============================================================
   */
  it('14. leak: lista pública não expõe a propriedade deletedAt', async () => {
    mockPrisma.professional.findMany.mockResolvedValue([profActive, profSusp]);

    const res = await request(app.getHttpServer())
      .get('/professionals')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    for (const item of res.body) {
      expect(Object.prototype.hasOwnProperty.call(item, 'deletedAt')).toBe(
        false,
      );
    }
  });

  it('15. leak: perfil público por slug não expõe a propriedade deletedAt', async () => {
    const res = await request(app.getHttpServer())
      .get('/professionals/slug/ativa')
      .expect(200);

    expect(res.body.id).toBe('prof-active');
    expect(Object.prototype.hasOwnProperty.call(res.body, 'deletedAt')).toBe(
      false,
    );
  });
});
