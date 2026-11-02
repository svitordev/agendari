import 'reflect-metadata';

/*
 * Segredo EXCLUSIVO deste teste — definido no processo do jest,
 * sem ler .env. Precisa existir antes do compile (requireJwtSecret).
 */
process.env.JWT_SECRET = 'cancel-public-test-secret';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { AppointmentsModule } from './appointments.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/*
 * ============================================================
 * cancel-public — contrato público de cancelamento pelo CLIENTE
 * (mocks, sem banco). Cobertura dos gaps de teste do ciclo
 * Customer Appointment Experience (2026-10-31).
 *
 * Contrato REAL (appointments.service.ts → cancelPublic):
 *   - findUnique por id (include customer);
 *   - não existe (ou sem customer) → 404 'Agendamento não encontrado.';
 *   - telefone não bate (comparação via getLocalPhone dos dois lados)
 *     → 404 'Agendamento não encontrado para este telefone.';
 *   - status NÃO cancelável (CANCELLED/COMPLETED/NO_SHOW)
 *     → 400 'Este agendamento não pode mais ser cancelado.';
 *   - data <= now → 400 'Não é possível cancelar um agendamento que já iniciou.';
 *   - sucesso: UMA única write com status=CANCELLED + cancelledBy=CUSTOMER
 *     + cancellationReason=null + cancelledAt=now (nunca metadata parcial);
 *   - DTO aceita SOMENTE phone (reason extra → 400 pelo ValidationPipe).
 *
 * Ordem real das checagens: ownership → status → timing.
 * ============================================================
 */
describe('cancel-public — contrato público do cliente (mocks, sem banco)', () => {
  let app: INestApplication;

  // Datas RELATIVAS ao relógio real — o service compara com new Date() real.
  // O teste de boundary usa relógio fixo próprio.
  const DAY = 86_400_000;
  const NOW_REF = new Date();
  const FUTURE = new Date(Date.now() + 3 * DAY);
  const PAST = new Date(Date.now() - 3 * DAY);

  const PHONE = '81999998888';
  const PHONE_OUTRO = '81988887777';

  const WRONG_PHONE_MESSAGE = 'Agendamento não encontrado para este telefone.';
  const NOT_FOUND_MESSAGE = 'Agendamento não encontrado.';
  const NO_LONGER_MESSAGE = 'Este agendamento não pode mais ser cancelado.';
  const ALREADY_STARTED_MESSAGE =
    'Não é possível cancelar um agendamento que já iniciou.';

  const cust1 = { id: 'cust-1', name: 'Cliente Teste', phone: PHONE };
  const cust2 = { id: 'cust-2', name: 'Cliente Formato', phone: '5581999998888' };

  const initialAppointments = () => ({
    'appt-pf': { id: 'appt-pf', status: 'PENDING', date: new Date(FUTURE), cancelledBy: null, cancellationReason: null, cancelledAt: null, customer: cust1 },
    'appt-cf': { id: 'appt-cf', status: 'CONFIRMED', date: new Date(FUTURE), cancelledBy: null, cancellationReason: null, cancelledAt: null, customer: cust1 },
    'appt-pp': { id: 'appt-pp', status: 'PENDING', date: new Date(PAST), cancelledBy: null, cancellationReason: null, cancelledAt: null, customer: cust1 },
    'appt-cp': { id: 'appt-cp', status: 'CONFIRMED', date: new Date(PAST), cancelledBy: null, cancellationReason: null, cancelledAt: null, customer: cust1 },
    'appt-can': { id: 'appt-can', status: 'CANCELLED', date: new Date(PAST), cancelledBy: 'CUSTOMER', cancellationReason: null, cancelledAt: new Date(PAST), customer: cust1 },
    'appt-com': { id: 'appt-com', status: 'COMPLETED', date: new Date(PAST), cancelledBy: null, cancellationReason: null, cancelledAt: null, customer: cust1 },
    'appt-ns': { id: 'appt-ns', status: 'NO_SHOW', date: new Date(PAST), cancelledBy: null, cancellationReason: null, cancelledAt: null, customer: cust1 },
    'appt-fmt': { id: 'appt-fmt', status: 'PENDING', date: new Date(FUTURE), cancelledBy: null, cancellationReason: null, cancelledAt: null, customer: cust2 },
  });

  let appointments: Record<string, any>;

  const mockPrisma = {
    customer: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    appointment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  function resetMocks() {
    appointments = initialAppointments();

    mockPrisma.customer.findMany.mockReset();
    mockPrisma.customer.findFirst.mockReset();
    mockPrisma.customer.create.mockReset();
    mockPrisma.appointment.findUnique.mockReset();
    mockPrisma.appointment.findFirst.mockReset();
    mockPrisma.appointment.findMany.mockReset();
    mockPrisma.appointment.update.mockReset();

    mockPrisma.appointment.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(appointments[where.id] ?? null),
    );

    // update sem include — devolve a linha atualizada (sem customer), como o real.
    mockPrisma.appointment.update.mockImplementation(({ where, data }: any) => {
      const found = appointments[where.id];
      if (!found) return Promise.resolve(null);
      Object.assign(found, data);
      const { customer: _customer, ...row } = found;
      return Promise.resolve(row);
    });

    mockPrisma.customer.findMany.mockResolvedValue([{ id: 'cust-1' }]);
    mockPrisma.appointment.findMany.mockResolvedValue([]);
  }

  const cancelPublic = (id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/appointments/${id}/cancel-public`)
      .send(body);

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule, AppointmentsModule],
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
    resetMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  /*
   * ============================================================
   * SUCESSO + METADATA NA MESMA WRITE
   * ============================================================
   */

  it('1. telefone correto + PENDING futuro → 200 com metadata completa na MESMA write', async () => {
    const res = await cancelPublic('appt-pf', { phone: PHONE }).expect(200);

    expect(mockPrisma.appointment.update).toHaveBeenCalledTimes(1);
    const callArg = mockPrisma.appointment.update.mock.calls[0][0];
    expect(callArg.data).toEqual({
      status: 'CANCELLED',
      cancelledBy: 'CUSTOMER',
      cancellationReason: null,
      cancelledAt: expect.any(Date),
    });

    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancelledBy).toBe('CUSTOMER');
    expect(res.body.cancellationReason).toBeNull();
    // No JSON da response, Date vira string ISO — o write recebeu um Date real.
    expect(new Date(res.body.cancelledAt).getTime()).not.toBeNaN();
    expect(new Date(res.body.cancelledAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('2. telefone correto + CONFIRMED futuro → 200', async () => {
    const res = await cancelPublic('appt-cf', { phone: PHONE }).expect(200);

    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancelledBy).toBe('CUSTOMER');
    expect(mockPrisma.appointment.update).toHaveBeenCalledTimes(1);
  });

  it('3. ownership funciona com formato equivalente já aceito (55+DDD local)', async () => {
    // Cliente gravado como '5581999998888'; cliente informa '81999998888'.
    const res = await cancelPublic('appt-fmt', { phone: PHONE }).expect(200);

    expect(res.body.status).toBe('CANCELLED');
    expect(mockPrisma.appointment.update).toHaveBeenCalledTimes(1);
  });

  /*
   * ============================================================
   * OWNERSHIP / EXISTÊNCIA
   * ============================================================
   */

  it('4. telefone incorreto → 404 sem escrita', async () => {
    const res = await cancelPublic('appt-pf', { phone: PHONE_OUTRO }).expect(404);

    expect(res.body.message).toBe(WRONG_PHONE_MESSAGE);
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
  });

  it('5. appointment inexistente → 404 sem escrita', async () => {
    const res = await cancelPublic('appt-inexistente', { phone: PHONE }).expect(404);

    expect(res.body.message).toBe(NOT_FOUND_MESSAGE);
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
  });

  it('6. appointment sem customer vinculado → 404 (guarda do service)', async () => {
    appointments['appt-pf'].customer = null;

    const res = await cancelPublic('appt-pf', { phone: PHONE }).expect(404);

    expect(res.body.message).toBe(NOT_FOUND_MESSAGE);
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
  });

  /*
   * ============================================================
   * TIMING (status check vem antes do timing — ordem real)
   * ============================================================
   */

  it('7. PENDING passado → 400 (já iniciou) sem escrita', async () => {
    const res = await cancelPublic('appt-pp', { phone: PHONE }).expect(400);

    expect(res.body.message).toBe(ALREADY_STARTED_MESSAGE);
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
  });

  it('8. CONFIRMED passado → 400 (já iniciou) sem escrita', async () => {
    const res = await cancelPublic('appt-cp', { phone: PHONE }).expect(400);

    expect(res.body.message).toBe(ALREADY_STARTED_MESSAGE);
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
  });

  it('9. boundary date === now → bloqueado (<=) com relógio fixo', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date(NOW_REF));

      appointments['appt-boundary'] = {
        id: 'appt-boundary',
        status: 'PENDING',
        date: new Date(NOW_REF),
        cancelledBy: null,
        cancellationReason: null,
        cancelledAt: null,
        customer: cust1,
      };

      const res = await cancelPublic('appt-boundary', { phone: PHONE }).expect(400);

      expect(res.body.message).toBe(ALREADY_STARTED_MESSAGE);
      expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  /*
   * ============================================================
   * TERMINAIS / CANCELAMENTO REPETIDO
   * ============================================================
   */

  it('10. CANCELLED → 400 não pode mais ser cancelado', async () => {
    const res = await cancelPublic('appt-can', { phone: PHONE }).expect(400);

    expect(res.body.message).toBe(NO_LONGER_MESSAGE);
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
  });

  it('11. COMPLETED → 400 não pode mais ser cancelado', async () => {
    const res = await cancelPublic('appt-com', { phone: PHONE }).expect(400);

    expect(res.body.message).toBe(NO_LONGER_MESSAGE);
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
  });

  it('12. NO_SHOW → 400 não pode mais ser cancelado', async () => {
    const res = await cancelPublic('appt-ns', { phone: PHONE }).expect(400);

    expect(res.body.message).toBe(NO_LONGER_MESSAGE);
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
  });

  it('13. cancelamento repetido → primeiro 200, segundo 400 (sem segunda write)', async () => {
    await cancelPublic('appt-pf', { phone: PHONE }).expect(200);
    expect(mockPrisma.appointment.update).toHaveBeenCalledTimes(1);

    const res = await cancelPublic('appt-pf', { phone: PHONE }).expect(400);

    expect(res.body.message).toBe(NO_LONGER_MESSAGE);
    expect(mockPrisma.appointment.update).toHaveBeenCalledTimes(1);
  });

  /*
   * ============================================================
   * LIFECYCLE DO PROFESSIONAL — não bloqueiam appointment existente
   * (o service NÃO consulta Professional no cancel-public; os testes
   * de suspensão/arquivamento já cobrem os guards — aqui provamos que
   * o cancelamento de appointment existente continua pelo contrato).
   * ============================================================
   */

  it('14. appointment existente de Professional SUSPENDED continua cancelável', async () => {
    appointments['appt-susp'] = {
      id: 'appt-susp',
      status: 'PENDING',
      date: new Date(FUTURE),
      cancelledBy: null,
      cancellationReason: null,
      cancelledAt: null,
      customer: cust1,
      professional: { id: 'prof-x', status: 'SUSPENDED', deletedAt: null },
    };

    const res = await cancelPublic('appt-susp', { phone: PHONE }).expect(200);

    expect(res.body.status).toBe('CANCELLED');
    expect(mockPrisma.appointment.update).toHaveBeenCalledTimes(1);
  });

  it('15. appointment existente de Professional ARQUIVADO continua cancelável', async () => {
    appointments['appt-arch'] = {
      id: 'appt-arch',
      status: 'CONFIRMED',
      date: new Date(FUTURE),
      cancelledBy: null,
      cancellationReason: null,
      cancelledAt: null,
      customer: cust1,
      professional: { id: 'prof-y', status: 'ACTIVE', deletedAt: new Date(Date.now() - DAY).toISOString() },
    };

    const res = await cancelPublic('appt-arch', { phone: PHONE }).expect(200);

    expect(res.body.status).toBe('CANCELLED');
    expect(mockPrisma.appointment.update).toHaveBeenCalledTimes(1);
  });

  /*
   * ============================================================
   * DTO — somente phone (reason NÃO existe no cancel de cliente)
   * ============================================================
   */

  it('16. body com reason extra → 400 (forbidNonWhitelisted) sem escrita', async () => {
    await cancelPublic('appt-pf', { phone: PHONE, reason: 'quero mudar de horário' }).expect(400);

    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
  });

  it('17. phone vazio → 400 (IsNotEmpty) sem escrita', async () => {
    await cancelPublic('appt-pf', { phone: '' }).expect(400);

    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
  });

  /*
   * ============================================================
   * BY-PHONE — gaps relevantes (o resto já é coberto por
   * appointments-by-phone.spec.ts e find-by-phone-query.dto.spec.ts)
   * ============================================================
   */

  const getByPhone = (query: string) =>
    request(app.getHttpServer()).get(`/appointments/by-phone?${query}`);

  it('18. by-phone: nenhum customer encontrado → 404 com mensagem do contrato', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([]);

    const res = await getByPhone(`phone=${PHONE}`).expect(404);

    expect(res.body.message).toBe('Nenhum cliente encontrado para este telefone.');
    expect(mockPrisma.appointment.findMany).not.toHaveBeenCalled();
  });

  it('19. by-phone: normalização — entrada formatada vira OR com os formatos já aceitos', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([{ id: 'cust-1' }]);
    mockPrisma.appointment.findMany.mockResolvedValue([]);

    await getByPhone('phone=%2881%29%2099999-8888').expect(200);

    const arg = mockPrisma.appointment.findMany.mock.calls[0][0];
    expect(arg).toBeDefined();

    const orClauses = mockPrisma.customer.findMany.mock.calls[0][0].where.OR.map(
      (c: any) => c.phone,
    );
    expect(orClauses).toContain('81999998888'); // normalizado == local
    expect(orClauses).toContain('5581999998888'); // 55 + local
    expect(orClauses.some((c: any) => typeof c === 'object' && c.endsWith === '81999998888')).toBe(true);
  });

  it('20. by-phone: ordenação date desc + take/skip padrão preservados', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([{ id: 'cust-1' }]);
    mockPrisma.appointment.findMany.mockResolvedValue([]);

    await getByPhone(`phone=${PHONE}`).expect(200);

    const arg = mockPrisma.appointment.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual({ date: 'desc' });
    expect(arg.take).toBe(50);
    expect(arg.skip).toBe(0);
  });

  it('21. by-phone: sem professionalId retorna appointments de múltiplos Professionals juntos', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([{ id: 'cust-1' }]);
    mockPrisma.appointment.findMany.mockResolvedValue([
      { id: 'x1', professionalId: 'prof-1', status: 'PENDING', date: new Date(FUTURE) },
      { id: 'x2', professionalId: 'prof-2', status: 'CONFIRMED', date: new Date(PAST) },
    ]);

    const res = await getByPhone(`phone=${PHONE}`).expect(200);

    expect(res.body).toHaveLength(2);
    const arg = mockPrisma.appointment.findMany.mock.calls[0][0];
    expect(arg.where.professionalId).toBeUndefined();
  });
});
