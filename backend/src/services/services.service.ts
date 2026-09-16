import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  /*
   * Garante que professionalId foi resolvido a partir do JWT.
   * Se undefined, o usuário não possui perfil profissional atrelado.
   */
  private ensureProfessionalId(professionalId: string | undefined): string {
    if (!professionalId) {
      throw new ForbiddenException('Usuário não possui perfil profissional.');
    }

    return professionalId;
  }

  /*
   * CRIAÇÃO PRIVADA — professionalId vem exclusivamente do JWT.
   */
  async create(professionalId: string, dto: CreateServiceDto) {
    professionalId = this.ensureProfessionalId(professionalId);

    return this.prisma.service.create({
      data: {
        ...dto,
        professionalId,
      },
    });
  }

  /*
   * LISTA PRIVADA — todos os serviços do profissional autenticado
   * (ativos + inativos).
   */
  async findMine(professionalId: string) {
    professionalId = this.ensureProfessionalId(professionalId);

    return this.prisma.service.findMany({
      where: { professionalId },
      orderBy: { name: 'asc' },
    });
  }

  /*
   * LISTA PÚBLICA — somente serviços ativos de um profissional.
   * Usado pela página pública /professional/[slug].
   */
  async findPublicByProfessional(professionalId: string) {
    return this.prisma.service.findMany({
      where: { professionalId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  /*
   * BUSCA PRIVADA — um serviço, se appartient ao profissional autenticado.
   */
  async findOne(id: string, professionalId: string) {
    professionalId = this.ensureProfessionalId(professionalId);

    const service = await this.prisma.service.findUnique({
      where: { id },
    });

    if (!service || service.professionalId !== professionalId) {
      throw new NotFoundException('Serviço não encontrado.');
    }

    return service;
  }

  /*
   * EDIÇÃO PRIVADA — só o dono pode editar.
   */
  async update(id: string, professionalId: string, dto: UpdateServiceDto) {
    professionalId = this.ensureProfessionalId(professionalId);

    const service = await this.prisma.service.findFirst({
      where: { id, professionalId },
    });

    if (!service) {
      throw new NotFoundException('Serviço não encontrado.');
    }

    return this.prisma.service.update({
      where: { id },
      data: dto,
    });
  }

  /*
   * EXCLUSÃO PRIVADA — só o dono pode excluir.
   */
  async remove(id: string, professionalId: string) {
    professionalId = this.ensureProfessionalId(professionalId);

    const service = await this.prisma.service.findFirst({
      where: {
        id,
        professionalId,
      },

      include: {
        _count: {
          select: {
            appointments: true,
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException('Serviço não encontrado.');
    }

    if (service._count.appointments > 0) {
      throw new ConflictException(
        'Este serviço possui agendamentos vinculados e não pode ser excluído. Desative o serviço para removê-lo da página pública.',
      );
    }

    try {
      return await this.prisma.service.delete({
        where: {
          id,
        },
      });
    } catch (error: any) {
      /*
       * Proteção adicional caso um relacionamento
       * seja criado entre a verificação e o delete.
       */
      if (error?.code === 'P2003') {
        throw new ConflictException(
          'Este serviço possui dados vinculados e não pode ser excluído. Desative o serviço em vez de apagá-lo.',
        );
      }

      throw error;
    }
  }

  // Buscar serviços ativos com detalhes para cálculo de horários
  async findActiveWithDetails(professionalId: string) {
    return this.prisma.service.findMany({
      where: { professionalId, isActive: true },
      select: {
        id: true,
        name: true,
        durationMinutes: true,
        price: true,
        description: true,
      },
    });
  }
}
