import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateProfessionalDto } from './dto/create-professional.dto';
import { UpdateProfessionalProfileDto } from './dto/update-professional-profile.dto';

@Injectable()
export class ProfessionalsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProfessionalDto) {
    const existing = await this.prisma.professional.findUnique({
      where: {
        slug: dto.slug,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Este link personalizado já está em uso por outra profissional.',
      );
    }

    return this.prisma.professional.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        bio: dto.bio,
        avatarUrl: dto.avatarUrl,
        instagram: dto.socialMedia?.instagram,
        facebook: dto.socialMedia?.facebook,
      },
    });
  }

  async findAll() {
    return this.prisma.professional.findMany({
      include: {
        services: {
          where: {
            isActive: true,
          },
        },

        availabilities: {
          where: {
            isActive: true,
          },

          include: {
            periods: true,
          },
        },
      },
    });
  }

  async findOneById(id: string) {
    if (!id) {
      throw new BadRequestException('Profissional não identificado.');
    }

    const professional = await this.prisma.professional.findUnique({
      where: {
        id,
      },

      include: {
        services: {
          where: {
            isActive: true,
          },
        },

        availabilities: {
          orderBy: {
            dayOfWeek: 'asc',
          },

          include: {
            periods: {
              orderBy: {
                startTime: 'asc',
              },
            },
          },
        },

        /*
         * Não retornamos password.
         */
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    if (!professional) {
      throw new NotFoundException(`Profissional com ID ${id} não encontrada.`);
    }

    return professional;
  }

  async findOneBySlug(slug: string) {
    const professional = await this.prisma.professional.findUnique({
      where: {
        slug,
      },

      include: {
        services: {
          where: {
            isActive: true,
          },

          orderBy: {
            name: 'asc',
          },
        },

        availabilities: {
          where: {
            isActive: true,
          },

          orderBy: {
            dayOfWeek: 'asc',
          },

          include: {
            periods: {
              orderBy: {
                startTime: 'asc',
              },
            },
          },
        },
      },
    });

    if (!professional) {
      throw new NotFoundException(
        `A página da profissional "${slug}" não foi encontrada.`,
      );
    }

    return professional;
  }

  async updateProfile(id: string, dto: UpdateProfessionalProfileDto) {
    if (!id) {
      throw new BadRequestException('Profissional não identificado.');
    }

    const existing = await this.prisma.professional.findUnique({
      where: {
        id,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Profissional com ID ${id} não encontrada.`);
    }

    /*
     * ==========================================================
     * NOME
     * ==========================================================
     *
     * Nome é obrigatório.
     * Se não veio no PATCH, não altera.
     * Se veio vazio/null, rejeita.
     */

    let name: string | undefined;

    if (dto.name !== undefined) {
      if (dto.name === null || !dto.name.trim()) {
        throw new BadRequestException('O nome do profissional é obrigatório.');
      }

      name = dto.name.trim();
    }

    /*
     * ==========================================================
     * CAMPOS OPCIONAIS
     * ==========================================================
     *
     * undefined = não altera
     * null      = salva null
     * ""        = salva null
     * texto     = trim + salva
     */

    const normalizeOptionalText = (
      value: string | null | undefined,
    ): string | null | undefined => {
      if (value === undefined) {
        return undefined;
      }

      if (value === null) {
        return null;
      }

      const trimmed = value.trim();

      return trimmed || null;
    };

    const bio = normalizeOptionalText(dto.bio);

    const avatarUrl = normalizeOptionalText(dto.avatarUrl);

    const instagram = normalizeOptionalText(dto.instagram);

    const facebook = normalizeOptionalText(dto.facebook);

    /*
     * ==========================================================
     * WHATSAPP
     * ==========================================================
     */

    let whatsapp: string | null | undefined;

    if (dto.whatsapp === undefined) {
      /*
       * Campo não enviado:
       * mantém como está.
       */
      whatsapp = undefined;
    } else if (dto.whatsapp === null || !dto.whatsapp.trim()) {
      /*
       * Campo vazio:
       * remove WhatsApp existente.
       */
      whatsapp = null;
    } else {
      const normalizedWhatsApp = dto.whatsapp.replace(/\D/g, '');

      if (normalizedWhatsApp.length < 10 || normalizedWhatsApp.length > 13) {
        throw new BadRequestException('Informe um WhatsApp válido.');
      }

      whatsapp = normalizedWhatsApp;
    }

    /*
     * ==========================================================
     * UPDATE
     * ==========================================================
     */

    return this.prisma.professional.update({
      where: {
        id,
      },

      data: {
        name,
        bio,
        avatarUrl,
        instagram,
        facebook,
        whatsapp,

        /*
         * Se themeColors vier null ou undefined,
         * não tentamos gravar JSON inválido.
         */
        ...(dto.themeColors
          ? {
              themeColors: dto.themeColors,
            }
          : {}),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.professional.findUnique({
      where: {
        id,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Profissional com ID ${id} não encontrada.`);
    }

    return this.prisma.professional.delete({
      where: {
        id,
      },
    });
  }
}
