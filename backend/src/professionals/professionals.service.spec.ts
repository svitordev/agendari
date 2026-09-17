import { ProfessionalsService } from './professionals.service';
import { PrismaService } from '../prisma/prisma.service';
import { FindProfessionalsDto } from './dto/find-professionals.dto';

describe('ProfessionalsService.findAll (Prisma mockado)', () => {
  let service: ProfessionalsService;
  let prisma: jest.Mocked<PrismaService>;

  const mockPrisma = {
    professional: {
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = mockPrisma as unknown as jest.Mocked<PrismaService>;
    service = new ProfessionalsService(prisma);
  });

  describe('defaults', () => {
    it('findAll(undefined) → take: 20, skip: 0, orderBy: { slug: "asc" }', async () => {
      (prisma.professional.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll(undefined);

      expect(prisma.professional.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 0,
          orderBy: { slug: 'asc' },
        }),
      );
    });

    it('findAll({}) → take: 20, skip: 0', async () => {
      (prisma.professional.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll({});

      expect(prisma.professional.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 0,
          orderBy: { slug: 'asc' },
        }),
      );
    });
  });

  describe('com limit e offset', () => {
    it('findAll({ limit: 50 }) → take: 50, skip: 0', async () => {
      (prisma.professional.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll({ limit: 50 });

      expect(prisma.professional.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 0,
        }),
      );
    });

    it('findAll({ limit: 50, offset: 20 }) → take: 50, skip: 20', async () => {
      (prisma.professional.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll({ limit: 50, offset: 20 });

      expect(prisma.professional.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 20,
        }),
      );
    });
  });

  describe('includes', () => {
    it('findAll mantém includes de services ativos', async () => {
      (prisma.professional.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll();

      const callArgs = (prisma.professional.findMany as jest.Mock).mock
        .calls[0][0];
      expect(callArgs.include).toHaveProperty('services');
      expect(callArgs.include.services).toEqual(
        expect.objectContaining({
          where: { isActive: true },
        }),
      );
    });

    it('findAll mantém includes de availabilities ativas com periods', async () => {
      (prisma.professional.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll();

      const callArgs = (prisma.professional.findMany as jest.Mock).mock
        .calls[0][0];
      expect(callArgs.include).toHaveProperty('availabilities');
      expect(callArgs.include.availabilities).toEqual(
        expect.objectContaining({
          where: { isActive: true },
          include: { periods: true },
        }),
      );
    });
  });
});
