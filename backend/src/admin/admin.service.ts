import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { AdminListProfessionalsDto } from './dto/admin-list-professionals.dto';
import { AdminCreateProfessionalDto } from './dto/admin-create-professional.dto';

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

  /*
   * ============================================================
   * Criação atômica: 1 Professional + 1 User PROFESSIONAL.
   *
   * Nested write — UMA única operação Prisma (atomicidade é
   * propriedade do nested create; sem user.create separado).
   * Hash bcrypt (custo 10, igual AuthService) ANTES da escrita.
   * role hardcoded — o cliente não controla role/ids/timestamps
   * (forbidNonWhitelisted já os rejeita no DTO).
   * Unicidade: a constraint é a autoridade — P2002 mapeado para
   * 409 (sem precheck findUnique como única proteção — TOCTOU).
   * ============================================================
   */
  async createProfessional(dto: AdminCreateProfessionalDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      const created = await this.prisma.professional.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          user: {
            create: {
              email: dto.email,
              firstName: dto.firstName,
              lastName: dto.lastName,
              password: passwordHash,
              role: Role.PROFESSIONAL,
            },
          },
        },
        // select explícito — password nunca sai daqui.
        select: {
          id: true,
          slug: true,
          name: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              professionalId: true,
              createdAt: true,
            },
          },
        },
      });

      return {
        professional: {
          id: created.id,
          slug: created.slug,
          name: created.name,
          createdAt: created.createdAt,
        },
        user: created.user,
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // meta.target vem como string (unique simples) ou array
        // (composto) conforme o runtime/client — trata ambos.
        const target = err.meta?.target;
        const fields = Array.isArray(target)
          ? target.map(String)
          : typeof target === 'string'
            ? [target]
            : [];

        if (fields.includes('email')) {
          throw new ConflictException('E-mail já cadastrado.');
        }
        if (fields.includes('slug')) {
          throw new ConflictException('Slug já cadastrado.');
        }
        throw new ConflictException('Já existe um cadastro com esses dados.');
      }
      // Outros erros seguem o tratamento normal do Nest.
      throw err;
    }
  }
}
