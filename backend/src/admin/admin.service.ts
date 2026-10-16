import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AdminListProfessionalsDto } from './dto/admin-list-professionals.dto';

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

/*
 * ============================================================
 * AdminService — lógica do backoffice.
 *
 * Listagem administrativa NÃO reutiliza ProfessionalsService:
 * a listagem pública tem includes de renderização (services,
 * availabilities, periods); a admin usa select explícito +
 * contagens. Responsabilidades separadas.
 * ============================================================
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listProfessionals(dto: AdminListProfessionalsDto) {
    const limit = dto.limit ?? DEFAULT_LIMIT;
    const offset = dto.offset ?? DEFAULT_OFFSET;

    /*
     * Um único where, usado IGUALMENTE em findMany e count —
     * garante que total reflete o mesmo filtro da página.
     *
     * Professional pode existir SEM User: a branch
     * { user: { email: ... } } simplesmente não casa nesses
     * registros (inner-join), mas name/slug continuam casando.
     */
    const search = dto.search;
    const where: Prisma.ProfessionalWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
            { user: { email: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.professional.findMany({
        where,
        take: limit,
        skip: offset,
        // Ordenação determinística: tiebreaker por id.
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        // select explícito — password nunca entra aqui.
        select: {
          id: true,
          slug: true,
          name: true,
          avatarUrl: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
          _count: {
            select: {
              services: true,
              appointments: true,
            },
          },
        },
      }),
      this.prisma.professional.count({ where }),
    ]);

    return { items, total, limit, offset };
  }
}
