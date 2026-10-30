import 'reflect-metadata';

/*
 * Segredo EXCLUSIVO deste teste — definido no processo do jest,
 * sem ler .env. Precisa existir antes do compile (requireJwtSecret).
 */
process.env.JWT_SECRET = 'status-transition-test-secret';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { AppointmentsModule } from './appointments.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/*
 * ============================================================
 * State machine de status pelo PROFESSIONAL — hardening
 * (regras temporais + escrita atômica CAS), sem banco real.
 *
 * Matriz (preservada):
 *   PENDING   → CONFIRMED | CANCELLED
 *   CONFIRMED → COMPLETED | CANCELLED | NO_SHOW
 *   CANCELLED / COMPLETED / NO_SHOW → terminais
 *   mesmo estado → 400 (sem escrita)
 *
 * Timing (novo):
 *   COMPLETED/NO_SHOW somente com date <= now (boundary <=);
 *   CANCELLED somente com date > now (mesma mensagem do
 *   cancel-public); PENDING→CONFIRMED sem restrição de timing.
 *
 * Concorrência (novo): updateMany CAS com where
 * { id, professionalId, status lido }; count=0 → re-check:
 * 404 (não existe/tenant) ou 409 (status mudou).
 *
 * Tenant: professionalId SEMPRE do JWT; cross-tenant → 404.
 * Leitura final: null (delete concorrente) → 404, nunca 200 null.
 * ============================================================
 */
describe('State machine de status — Professional (mocks, sem banco)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const TRANSITION_MESSAGE = 'Esta alteração de status não é permitida.';
  const NOT_YET_MESSAGE = 'O horário agendado ainda não ocorreu.';
  const ALREADY_STARTED_MESSAGE =
    'Não é possível cancelar um agendamento que já iniciou.';
  const RACE_MESSAGE =
    'O agendamento foi alterado por outra operação. Atualize e tente novamente.';

  const FUTURE = new Date('2027-06-15T12:00:00.000Z');
  const PAST = new Date('2026-01-01T12:00:00.000Z');

  const users: Record<string, any> = {
    'user-a': {
      id: 'user-a',
      email: 'pro-a@test.local',
      firstName: 'Pro',
      lastName: 'A',
      role: 'PROFESSIONAL',
      professional: { id: 'prof-a', status: 'ACTIVE', deletedAt: null },
    },
    'user-b': {
      id: 'user-b',
      email: 'pro-b@test.local',
      firstName: 'Pro',
      lastName: 'B',
      role: 'PROFESSIONAL',
      professional: { id: 'prof-b', status: 'ACTIVE', deletedAt: null },
    },
    'user-admin': {
      id: 'user-admin',
      email: 'admin@test.local',
      firstName: 'Ada',
      lastName: 'Admin',
      role: 'ADMIN',
      professional: null,
    },
  };

  const initialAppointments = () => ({
    'appt-a1': { id: 'appt-a1', professionalId: 'prof-a', status: 'PENDING', date: new Date(FUTURE), cancelledBy: null, cancellationReason: null, cancelledAt: null },
    'appt-a2': { id: 'appt-a2', professionalId: 'prof-a', status: 'PENDING', date: new Date(PAST), cancelledBy: null, cancellationReason: null, cancelledAt: null },
    'appt-a3': { id: 'appt-a3', professionalId: 'prof-a', status: 'CONFIRMED', date: new Date(FUTURE), cancelledBy: null, cancellationReason: null, cancelledAt: null },
    'appt-a4': { id: 'appt-a4', professionalId: 'prof-a', status: 'CONFIRMED', date: new Date(PAST), cancelledBy: null, cancellationReason: null, cancelledAt: null },
    'appt-a5': { id: 'appt-a5', professionalId: 'prof-a', status: 'CANCELLED', date: new Date(PAST), cancelledBy: 'PROFESSIONAL', cancellationReason: 'motivo', cancelledAt: new Date(PAST) },
    'appt-a6': { id: 'appt-a6', professionalId: 'prof-a', status: 'COMPLETED', date: new Date(PAST), cancelledBy: null, cancellationReason: null, cancelledAt: null },
    'appt-a7': { id: 'appt-a7', professionalId: 'prof-a', status: 'NO_SHOW', date: new Date(PAST), cancelledBy: null, cancellationReason: null, cancelledAt: null },
    'appt-b1': { id: 'appt-b1', professionalId: 'prof-b', status: 'PENDING', date: new Date(FUTURE), cancelledBy: null, cancellationReason: null, cancelledAt: null },
  });

  let appointments: Record<string, any>;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(users[where.id] ?? null),
      ),
    },
    appointment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
  };

  /*
   * findFirst respeita tenant (id + professionalId) — como o real.
   * updateMany simula o CAS: só escreve se o status atual bater.
   */
  function resetMocks() {
    appointments = initialAppointments();

    // Zera histórico de chamadas antes de reinstalar as implementações.
    mockPrisma.appointment.findFirst.mockReset();
    mockPrisma.appointment.findUnique.mockReset();
    mockPrisma.appointment.findMany.mockReset();
    mockPrisma.appointment.create.mockReset();
    mockPrisma.appointment.update.mockReset();
    mockPrisma.appointment.updateMany.mockReset();
    mockPrisma.appointment.delete.mockReset();

    mockPrisma.appointment.findFirst.mockImplementation(({ where }: any) => {
      const found = appointments[where.id];
      if (!found) return Promise.resolve(null);
      if (where.professionalId && found.professionalId !== where.professionalId) {
        return Promise.resolve(null);
      }
      return Promise.resolve(found);
    });

    mockPrisma.appointment.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(appointments[where.id] ?? null),
    );

    mockPrisma.appointment.updateMany.mockImplementation(({ where, data }: any) => {
      const found = appointments[where.id];
      if (
        found &&
        found.professionalId === where.professionalId &&
        found.status === where.status
      ) {
        Object.assign(found, data);
        return Promise.resolve({ count: 1 });
      }
      return Promise.resolve({ count: 0 });
    });

    mockPrisma.appointment.update.mockReset();
    mockPrisma.appointment.create.mockReset();
    mockPrisma.appointment.delete.mockReset();
    mockPrisma.appointment.findMany.mockReset().mockResolvedValue([]);
  }

  const tokenFor = (userId: string) =>
    jwtService.sign({ sub: userId, email: users[userId].email });

  const patchStatus = (
    userId: string,
    id: string,
    body: { status: string; reason?: string },
  ) =>
    request(app.getHttpServer())
      .patch(`/appointments/${id}/status`)
      .set('Authorization', `Bearer ${tokenFor(userId)}`)
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

    jwtService = app.get(JwtService);
  });

  beforeEach(() => {
    mockPrisma.user.findUnique.mockClear();
    resetMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  /*
   * ============================================================
   * AUTH / TENANT
   * ============================================================
   */

  it('1. sem token → 401', async () => {
    await request(app.getHttpServer())
      .patch('/appointments/appt-a1/status')
      .send({ status: 'CONFIRMED' })
      .expect(401);
  });

  it('2. ADMIN sem Professional associado → 400 atual (sem branch especial)', async () => {
    const res = await patchStatus('user-admin', 'appt-a1', {
      status: 'CONFIRMED',
    }).expect(400);

    expect(res.body.message).toBe('Profissional não identificado.');
    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('3. Professional A altera Appointment A (PENDING futuro → CONFIRMED) → 200', async () => {
    const res = await patchStatus('user-a', 'appt-a1', {
      status: 'CONFIRMED',
    }).expect(200);

    expect(res.body.status).toBe('CONFIRMED');
  });

  it('4. Professional A tenta Appointment de B → 404 (cross-tenant, sem escrita)', async () => {
    const res = await patchStatus('user-a', 'appt-b1', {
      status: 'CONFIRMED',
    }).expect(404);

    expect(res.body.message).toBe('Agendamento não encontrado.');
    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('5. appointment inexistente → 404', async () => {
    await patchStatus('user-a', 'appt-inexistente', {
      status: 'CONFIRMED',
    }).expect(404);

    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  /*
   * ============================================================
   * PENDING FUTURO
   * ============================================================
   */

  it('6. PENDING futuro → CONFIRMED = 200', async () => {
    const res = await patchStatus('user-a', 'appt-a1', {
      status: 'CONFIRMED',
    }).expect(200);

    expect(res.body.status).toBe('CONFIRMED');
  });

  it('7. PENDING futuro → CANCELLED = 200 (com motivo)', async () => {
    const res = await patchStatus('user-a', 'appt-a1', {
      status: 'CANCELLED',
      reason: 'cliente remarcou',
    }).expect(200);

    expect(res.body.status).toBe('CANCELLED');
  });

  it('8. cancellation metadata correta na MESMA write atômica', async () => {
    await patchStatus('user-a', 'appt-a1', {
      status: 'CANCELLED',
      reason: 'cliente remarcou',
    }).expect(200);

    expect(mockPrisma.appointment.updateMany).toHaveBeenCalledTimes(1);

    const arg = mockPrisma.appointment.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      id: 'appt-a1',
      professionalId: 'prof-a',
      status: 'PENDING',
    });
    expect(arg.data.status).toBe('CANCELLED');
    expect(arg.data.cancelledBy).toBe('PROFESSIONAL');
    expect(arg.data.cancellationReason).toBe('cliente remarcou');
    expect(arg.data.cancelledAt).toBeInstanceOf(Date);

    // Estado final no "banco" coerente com a response.
    expect(appointments['appt-a1'].cancelledBy).toBe('PROFESSIONAL');
    expect(appointments['appt-a1'].cancellationReason).toBe('cliente remarcou');
  });

  it('9. PENDING futuro → COMPLETED = 400 (transição inexistente)', async () => {
    const res = await patchStatus('user-a', 'appt-a1', {
      status: 'COMPLETED',
    }).expect(400);

    expect(res.body.message).toBe(TRANSITION_MESSAGE);
    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('10. PENDING futuro → NO_SHOW = 400 (transição inexistente)', async () => {
    const res = await patchStatus('user-a', 'appt-a1', {
      status: 'NO_SHOW',
    }).expect(400);

    expect(res.body.message).toBe(TRANSITION_MESSAGE);
    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  /*
   * ============================================================
   * PENDING PASSADO (decisão deliberada: confirmar antes)
   * ============================================================
   */

  it('11. PENDING passado → CONFIRMED = 200 (confirmar sem restrição de timing)', async () => {
    const res = await patchStatus('user-a', 'appt-a2', {
      status: 'CONFIRMED',
    }).expect(200);

    expect(res.body.status).toBe('CONFIRMED');
  });

  it('12. PENDING passado → COMPLETED = 400 (precisa confirmar antes)', async () => {
    const res = await patchStatus('user-a', 'appt-a2', {
      status: 'COMPLETED',
    }).expect(400);

    expect(res.body.message).toBe(TRANSITION_MESSAGE);
    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('13. PENDING passado → NO_SHOW = 400 (precisa confirmar antes)', async () => {
    const res = await patchStatus('user-a', 'appt-a2', {
      status: 'NO_SHOW',
    }).expect(400);

    expect(res.body.message).toBe(TRANSITION_MESSAGE);
    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('14. PENDING passado → CANCELLED = 400 por timing (mensagem do cancel-public)', async () => {
    const res = await patchStatus('user-a', 'appt-a2', {
      status: 'CANCELLED',
      reason: 'não compareceu e passou',
    }).expect(400);

    expect(res.body.message).toBe(ALREADY_STARTED_MESSAGE);
    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  /*
   * ============================================================
   * CONFIRMED FUTURO
   * ============================================================
   */

  it('15. CONFIRMED futuro → CANCELLED = 200 (com motivo)', async () => {
    const res = await patchStatus('user-a', 'appt-a3', {
      status: 'CANCELLED',
      reason: 'imprevisto',
    }).expect(200);

    expect(res.body.status).toBe('CANCELLED');
  });

  it('16. CONFIRMED futuro → COMPLETED = 400 por timing', async () => {
    const res = await patchStatus('user-a', 'appt-a3', {
      status: 'COMPLETED',
    }).expect(400);

    expect(res.body.message).toBe(NOT_YET_MESSAGE);
    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('17. CONFIRMED futuro → NO_SHOW = 400 por timing', async () => {
    const res = await patchStatus('user-a', 'appt-a3', {
      status: 'NO_SHOW',
    }).expect(400);

    expect(res.body.message).toBe(NOT_YET_MESSAGE);
    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  /*
   * ============================================================
   * CONFIRMED PASSADO
   * ============================================================
   */

  it('18. CONFIRMED passado → COMPLETED = 200', async () => {
    const res = await patchStatus('user-a', 'appt-a4', {
      status: 'COMPLETED',
    }).expect(200);

    expect(res.body.status).toBe('COMPLETED');
  });

  it('19. CONFIRMED passado → NO_SHOW = 200', async () => {
    const res = await patchStatus('user-a', 'appt-a4', {
      status: 'NO_SHOW',
    }).expect(200);

    expect(res.body.status).toBe('NO_SHOW');
  });

  it('20. CONFIRMED passado → CANCELLED = 400 por timing', async () => {
    const res = await patchStatus('user-a', 'appt-a4', {
      status: 'CANCELLED',
      reason: 'tarde demais',
    }).expect(400);

    expect(res.body.message).toBe(ALREADY_STARTED_MESSAGE);
    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  /*
   * ============================================================
   * TERMINAIS
   * ============================================================
   */

  it('21. CANCELLED → outro = 400', async () => {
    const res = await patchStatus('user-a', 'appt-a5', {
      status: 'CONFIRMED',
    }).expect(400);

    expect(res.body.message).toBe(TRANSITION_MESSAGE);
    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('22. COMPLETED → outro = 400', async () => {
    const res = await patchStatus('user-a', 'appt-a6', {
      status: 'CANCELLED',
      reason: 'x',
    }).expect(400);

    expect(res.body.message).toBe(TRANSITION_MESSAGE);
    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('23. NO_SHOW → outro = 400', async () => {
    const res = await patchStatus('user-a', 'appt-a7', {
      status: 'CONFIRMED',
    }).expect(400);

    expect(res.body.message).toBe(TRANSITION_MESSAGE);
    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  /*
   * ============================================================
   * MESMO ESTADO (idempotência = inválida, sem escrita)
   * ============================================================
   */

  it('24. CONFIRMED → CONFIRMED = 400 e nenhuma escrita', async () => {
    const res = await patchStatus('user-a', 'appt-a3', {
      status: 'CONFIRMED',
    }).expect(400);

    expect(res.body.message).toBe(TRANSITION_MESSAGE);
    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
  });

  it('25. CANCELLED → CANCELLED = 400 e nenhuma escrita', async () => {
    const res = await patchStatus('user-a', 'appt-a5', {
      status: 'CANCELLED',
      reason: 'de novo',
    }).expect(400);

    expect(res.body.message).toBe(TRANSITION_MESSAGE);
    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
  });

  /*
   * ============================================================
   * CONCORRÊNCIA (CAS + re-check)
   * ============================================================
   */

  it('26. updateMany count=1 → sucesso com response do estado final', async () => {
    const res = await patchStatus('user-a', 'appt-a1', {
      status: 'CONFIRMED',
    }).expect(200);

    expect(mockPrisma.appointment.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
    expect(res.body.status).toBe('CONFIRMED');
    expect(appointments['appt-a1'].status).toBe('CONFIRMED');
  });

  it('27. updateMany count=0 + re-check não encontrado → 404', async () => {
    // Pré-check acha; CAS falha (status mudou fora); re-check não acha mais.
    mockPrisma.appointment.findFirst
      .mockResolvedValueOnce(appointments['appt-a1'])
      .mockResolvedValueOnce(null);
    mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await patchStatus('user-a', 'appt-a1', {
      status: 'CONFIRMED',
    }).expect(404);

    expect(res.body.message).toBe('Agendamento não encontrado.');
  });

  it('28. updateMany count=0 + status mudou em outra sessão → 409', async () => {
    // Pré-check lê PENDING (stale); CAS falha (B confirmou no banco);
    // re-check mostra o estado real CONFIRMED → 409.
    mockPrisma.appointment.findFirst
      .mockResolvedValueOnce(appointments['appt-a1'])
      .mockResolvedValueOnce({ ...appointments['appt-a1'], status: 'CONFIRMED' });
    mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await patchStatus('user-a', 'appt-a1', {
      status: 'CANCELLED',
      reason: 'corrida',
    }).expect(409);

    expect(res.body.message).toBe(RACE_MESSAGE);
  });

  it('29. corrida não executa segunda write', async () => {
    mockPrisma.appointment.findFirst
      .mockResolvedValueOnce(appointments['appt-a1'])
      .mockResolvedValueOnce({ ...appointments['appt-a1'], status: 'CONFIRMED' });
    mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 0 });

    await patchStatus('user-a', 'appt-a1', {
      status: 'CANCELLED',
      reason: 'corrida',
    }).expect(409);

    // O CAS de A (esperava PENDING) não escreveu; nenhuma segunda write.
    expect(mockPrisma.appointment.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
    expect(appointments['appt-a1'].status).toBe('PENDING');
    expect(appointments['appt-a1'].cancelledBy).toBeNull();
  });

  it('30. corrida no cancelamento não deixa metadata parcial', async () => {
    mockPrisma.appointment.findFirst
      .mockResolvedValueOnce(appointments['appt-a1'])
      .mockResolvedValueOnce({ ...appointments['appt-a1'], status: 'CONFIRMED' });
    mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 0 });

    await patchStatus('user-a', 'appt-a1', {
      status: 'CANCELLED',
      reason: 'metadata não pode vazar',
    }).expect(409);

    expect(appointments['appt-a1'].cancellationReason).toBeNull();
    expect(appointments['appt-a1'].cancelledBy).toBeNull();
    expect(appointments['appt-a1'].cancelledAt).toBeNull();
  });

  /*
   * ============================================================
   * RESPONSE AUTHORITY
   * ============================================================
   */

  it('31. response após sucesso vem do estado final lido do banco', async () => {
    // Pré-leitura devolve SNAPSHOT à parte (stale): se o código
    // respondesse o objeto pré-escrita, a response sairia CONFIRMED.
    mockPrisma.appointment.findFirst.mockResolvedValueOnce({
      ...appointments['appt-a4'],
    });

    const res = await patchStatus('user-a', 'appt-a4', {
      status: 'COMPLETED',
    }).expect(200);

    // Write única com CAS no estado lido; sem metadata de cancelamento.
    expect(mockPrisma.appointment.updateMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.appointment.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      id: 'appt-a4',
      professionalId: 'prof-a',
      status: 'CONFIRMED',
    });
    expect(arg.data).toEqual({ status: 'COMPLETED' });

    // A response reflete o estado pós-CAS no "banco" (mock compartilhado).
    expect(res.body.status).toBe('COMPLETED');
    expect(appointments['appt-a4'].status).toBe('COMPLETED');
    expect(mockPrisma.appointment.findUnique).toHaveBeenCalled();
  });

  /*
   * ============================================================
   * BOUNDARY — horário exatamente agora (date <= now = já ocorreu)
   * ============================================================
   */

  it('32. boundary: date === now → COMPLETED permitido (<=)', async () => {
    // Relógio fixo: equality exata, sem depender de milissegundos reais.
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-10-29T12:00:00.000Z'));
      appointments['appt-a4'].date = new Date(); // exatamente agora

      const res = await patchStatus('user-a', 'appt-a4', {
        status: 'COMPLETED',
      }).expect(200);

      expect(res.body.status).toBe('COMPLETED');
    } finally {
      jest.useRealTimers();
    }
  });

  it('33. boundary: date === now → CANCELLED bloqueado (<=)', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-10-29T12:00:00.000Z'));
      appointments['appt-a3'].date = new Date(); // exatamente agora

      const res = await patchStatus('user-a', 'appt-a3', {
        status: 'CANCELLED',
        reason: 'exatamente na hora',
      }).expect(400);

      expect(res.body.message).toBe(ALREADY_STARTED_MESSAGE);
      expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  /*
   * ============================================================
   * REASON OBRIGATÓRIO NO CANCELAMENTO PROFISSIONAL
   * ============================================================
   */

  it('34. CANCELLED sem reason → 400 (sem escrita)', async () => {
    const res = await patchStatus('user-a', 'appt-a1', {
      status: 'CANCELLED',
    }).expect(400);

    expect(res.body.message).toBe('Informe o motivo do cancelamento.');
    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('35. CANCELLED com reason só espaços → 400 (trim vazio, sem escrita)', async () => {
    const res = await patchStatus('user-a', 'appt-a1', {
      status: 'CANCELLED',
      reason: '   ',
    }).expect(400);

    expect(res.body.message).toBe('Informe o motivo do cancelamento.');
    expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  /*
   * ============================================================
   * RACE COMPLETION / ANOMALIA / LEITURA FINAL
   * ============================================================
   */

  it('36. corrida no COMPLETED: A lê CONFIRMED, B marca NO_SHOW → 409 sem segunda write', async () => {
    mockPrisma.appointment.findFirst
      .mockResolvedValueOnce({ ...appointments['appt-a4'] })
      .mockResolvedValueOnce({ ...appointments['appt-a4'], status: 'NO_SHOW' });
    mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await patchStatus('user-a', 'appt-a4', {
      status: 'COMPLETED',
    }).expect(409);

    expect(res.body.message).toBe(RACE_MESSAGE);
    expect(mockPrisma.appointment.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
    expect(appointments['appt-a4'].status).toBe('CONFIRMED');
  });

  it('37. count=0 + re-check com MESMO status → 409 (comportamento documentado)', async () => {
    // CAS falhou sem o re-check mostrar status diferente — anomalia de
    // concorrência (mudou e voltou, ou condição de linha). O código
    // responde 409 genérico; nunca 200 com escrita não realizada.
    mockPrisma.appointment.findFirst
      .mockResolvedValueOnce({ ...appointments['appt-a1'] })
      .mockResolvedValueOnce({ ...appointments['appt-a1'] });
    mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await patchStatus('user-a', 'appt-a1', {
      status: 'CONFIRMED',
    }).expect(409);

    expect(res.body.message).toBe(RACE_MESSAGE);
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
    expect(appointments['appt-a1'].status).toBe('PENDING');
  });

  it('38. CAS ok mas leitura final some (delete concorrente) → 404, nunca 200 null', async () => {
    mockPrisma.appointment.findUnique.mockResolvedValueOnce(null);

    const res = await patchStatus('user-a', 'appt-a1', {
      status: 'CONFIRMED',
    }).expect(404);

    expect(res.body.message).toBe('Agendamento não encontrado.');
    expect(mockPrisma.appointment.updateMany).toHaveBeenCalledTimes(1);
  });
});
