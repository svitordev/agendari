import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from './appointments.service';
import { NotFoundException } from '@nestjs/common';

describe('AppointmentsService — findByPhone', () => {
  let service: AppointmentsService;
  let prisma: any;

  const mockPrisma = {
    customer: {
      findMany: jest.fn(),
    },
    appointment: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    prisma = {
      customer: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
      appointment: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('take/skip defaults', () => {
    it('sem limit/offset → take: 50, skip: 0', async () => {
      prisma.customer.findMany.mockResolvedValue([{ id: 'cust1' }]);
      prisma.appointment.findMany.mockResolvedValue([]);

      await service.findByPhone('11999999999');

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 0,
        }),
      );
    });

    it('limit=1, offset=0 → take: 1, skip: 0', async () => {
      prisma.customer.findMany.mockResolvedValue([{ id: 'cust1' }]);
      prisma.appointment.findMany.mockResolvedValue([]);

      await service.findByPhone('11999999999', undefined, 1, 0);

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1,
          skip: 0,
        }),
      );
    });

    it('limit=50, offset=20 → take: 50, skip: 20', async () => {
      prisma.customer.findMany.mockResolvedValue([{ id: 'cust1' }]);
      prisma.appointment.findMany.mockResolvedValue([]);

      await service.findByPhone('11999999999', undefined, 50, 20);

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 20,
        }),
      );
    });

    it('limit=100 → take: 100', async () => {
      prisma.customer.findMany.mockResolvedValue([{ id: 'cust1' }]);
      prisma.appointment.findMany.mockResolvedValue([]);

      await service.findByPhone('11999999999', undefined, 100);

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
          skip: 0,
        }),
      );
    });
  });

  describe('professionalId forwarding', () => {
    it('professionalId → Prisma where', async () => {
      prisma.customer.findMany.mockResolvedValue([{ id: 'cust1' }]);
      prisma.appointment.findMany.mockResolvedValue([]);

      await service.findByPhone('11999999999', 'pro123');

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            professionalId: 'pro123',
          }),
        }),
      );
    });

    it('professionalId undefined → sem filtro no where', async () => {
      prisma.customer.findMany.mockResolvedValue([{ id: 'cust1' }]);
      prisma.appointment.findMany.mockResolvedValue([]);

      await service.findByPhone('11999999999', undefined);

      const callArgs = prisma.appointment.findMany.mock.calls[0][0];
      expect(callArgs.where.professionalId).toBeUndefined();
    });
  });
});
