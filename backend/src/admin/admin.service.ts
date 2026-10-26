import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { AdminListProfessionalsDto } from './dto/admin-list-professionals.dto';
import { AdminCreateProfessionalDto } from './dto/admin-create-professional.dto';
import { AdminUpdateProfessionalDto } from './dto/admin-update-professional.dto';
import { AdminUpdateProfessionalStatusDto } from './dto/admin-update-professional-status.dto';

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
    const where: Prisma.ProfessionalWhereInput = {
      // Arquivados não aparecem na listagem normal — o filtro é
      // AND com o search (um archived não pode escapar pelo OR).
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { slug: { contains: search, mode: 'insensitive' as const } },
              {
                user: {
                  email: { contains: search, mode: 'insensitive' as const },
                },
              },
            ],
          }
        : {}),
    };

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
          status: true,
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
          status: true,
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
          status: created.status,
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

  /*
   * ============================================================
   * Leitura administrativa individual (fonte da tela de edição).
   * A listagem paginada não é fonte confiável para um registro
   * específico — o GET individual dá 404 semântico.
   *
   * select explícito — password nunca entra. Professional pode
   * existir SEM User: user vem null (a tela trata).
   * ============================================================
   */
  async getProfessional(id: string) {
    const row = await this.prisma.professional.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    // Arquivado não é exposto pelo GET normal — 404 semântico
    // (deletedAt é guard interno e não sai no response).
    if (!row || row.deletedAt) {
      throw new NotFoundException('Profissional não encontrado.');
    }

    const { user, deletedAt: _deletedAt, ...professional } = row;

    return { professional, user };
  }

  /*
   * ============================================================
   * Edição administrativa: Professional (name, slug) + User
   * (email, firstName, lastName) numa única nested write —
   * mesma filosofia do create (uma operação; atomicidade é
   * propriedade do nested write do Prisma).
   *
   * Pre-check findUnique (padrão do projeto para 404). Sem User
   * não se cria User silenciosamente nem se faz merge parcial:
   * → 409 antes de qualquer escrita. P2025 residual é apenas
   * fallback de corrida (Professional OU User podem ter deixado
   * de existir após o pre-check; a causa não é distinguível de
   * forma robusta) → 409 genérico, sem afirmar causa. P2002 →
   * mesmo mapeamento do create.
   * ============================================================
   */
  async updateProfessional(id: string, dto: AdminUpdateProfessionalDto) {
    const existing = await this.prisma.professional.findUnique({
      where: { id },
      select: { id: true, deletedAt: true, user: { select: { id: true } } },
    });

    if (!existing || existing.deletedAt) {
      // Arquivado não é editável — 404 (deletedAt visto só pelo guard).
      throw new NotFoundException('Profissional não encontrado.');
    }

    if (!existing.user) {
      throw new ConflictException(
        'Este profissional não possui usuário associado.',
      );
    }

    try {
      const updated = await this.prisma.professional.update({
        // Guarda de race: se um archive entrar entre o pre-check e a
        // escrita, o update não casa (P2025 → 409) — edit não altera
        // nem ressuscita arquivado silenciosamente.
        where: { id, deletedAt: null },
        data: {
          name: dto.name,
          slug: dto.slug,
          user: {
            update: {
              email: dto.email,
              firstName: dto.firstName,
              lastName: dto.lastName,
            },
          },
        },
        // select explícito — password nunca sai daqui.
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });

      const { user, ...professional } = updated;

      return { professional, user };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Mesmo mapeamento do create — meta.target pode vir
        // como string (unique simples) ou array (composto).
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

      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        // Fallback de corrida: Professional OU User podem ter
        // deixado de existir entre o pre-check e a nested write.
        // A causa não é distinguível de forma robusta (meta do
        // Prisma não é contrato estável; parsing de message é
        // frágil) → conflito genérico, sem afirmar causa e sem
        // vazar internals.
        throw new ConflictException(
          'O cadastro foi alterado durante a operação. Recarregue e tente novamente.',
        );
      }

      // Outros erros seguem o tratamento normal do Nest.
      throw err;
    }
  }

  /*
   * ============================================================
   * Mudança de estado operacional (PATCH /admin/professionals/:id/status).
   *
   * Responsabilidade separada da edição de dados — o DTO de
   * edição (5 campos) NÃO recebe status, e este DTO não toca
   * nos campos de dados.
   *
   * Idempotente: se o estado atual já é o pedido, retorna 200
   * com o estado atual SEM chamar update — updatedAt não é
   * alterado artificialmente e double action não gera escrita.
   *
   * Professional SEM User funciona normalmente — a suspensão é
   * do tenant (Professional), não do login; não exige User.
   *
   * P2025 residual (corrida entre pre-check e escrita) → 409
   * genérico, mesmo fallback das demais escritas admin.
   * P2002 não é esperado aqui — status não é unique.
   * ============================================================
   */
  async updateProfessionalStatus(
    id: string,
    dto: AdminUpdateProfessionalStatusDto,
  ) {
    const existing = await this.prisma.professional.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    // Arquivado não aceita mudança de status — 404. Restore NÃO é
    // reativação: deletedAt não é limpo por este endpoint.
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Profissional não encontrado.');
    }

    const { user, deletedAt: _deletedAt, ...professional } = existing;

    // No-op idempotente: já está no estado pedido → nenhuma escrita.
    if (professional.status === dto.status) {
      return { professional, user };
    }

    try {
      const updated = await this.prisma.professional.update({
        // Guarda de race: archive concorrente entre pre-check e
        // escrita → P2025 → 409 — status não altera arquivado.
        where: { id, deletedAt: null },
        data: { status: dto.status },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });

      const { user: updatedUser, ...updatedProfessional } = updated;

      return { professional: updatedProfessional, user: updatedUser };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        // Fallback de corrida: o Professional pode ter deixado de
        // existir entre o pre-check e a escrita → conflito genérico,
        // sem afirmar causa e sem vazar internals.
        throw new ConflictException(
          'O cadastro foi alterado durante a operação. Recarregue e tente novamente.',
        );
      }

      // Outros erros seguem o tratamento normal do Nest.
      throw err;
    }
  }

  /*
   * ============================================================
   * Arquivamento lógico (soft delete) — DELETE /admin/professionals/:id.
   *
   * NUNCA é hard delete Prisma: nenhuma linha é removida; User,
   * Services, Availability, Exceptions e Appointments permanecem
   * intactos (histórico, by-phone e cancel-public continuam).
   *
   * Idempotência: já arquivado → 204 SEM escrita (deletedAt
   * anterior não é sobrescrito). Inexistente → 404. Race de
   * archive concorrente → update condicional não casa (P2025)
   * → 204 — o outro archive venceu, estado final é o mesmo.
   *
   * Escreve SOMENTE deletedAt — status/name/slug/User não são
   * tocados. Professional sem User (user=null) arquiva normalmente.
   * ============================================================
   */
  async archiveProfessional(id: string): Promise<void> {
    const existing = await this.prisma.professional.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });

    if (!existing) {
      throw new NotFoundException('Profissional não encontrado.');
    }

    // Idempotente: já arquivado → 204 sem escrita, deletedAt
    // anterior preservado.
    if (existing.deletedAt) {
      return;
    }

    try {
      await this.prisma.professional.update({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        // Corrida: o update condicional não casou. P2025 sozinho não
        // distingue "outro archive venceu" de "linha sumiu" — re-check
        // mínimo decide: arquivado → 204 idempotente; inexistente →
        // 404 (não afirmar sucesso sobre algo que não existe).
        const rachecked = await this.prisma.professional.findUnique({
          where: { id },
          select: { id: true, deletedAt: true },
        });

        if (rachecked?.deletedAt) {
          return;
        }

        throw new NotFoundException('Profissional não encontrado.');
      }
      throw err;
    }
  }
}
