import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { CreateAvailabilityPeriodDto } from './dto/create-availability-period.dto';
import { UpdateAvailabilityPeriodDto } from './dto/update-availability-period.dto';
import { CreateAvailabilityExceptionDto } from './dto/create-availability-exception.dto';

@Injectable()
export class AvailabilitiesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /*
   * ============================================================
   * HELPERS
   * ============================================================
   */

  private timeToMinutes(time: string) {
    const [hours, minutes] = time
      .split(':')
      .map(Number);

    return hours * 60 + minutes;
  }

  private validatePeriod(
    startTime: string,
    endTime: string,
  ) {
    const start =
      this.timeToMinutes(startTime);

    const end =
      this.timeToMinutes(endTime);

    if (start >= end) {
      throw new BadRequestException(
        'O horário inicial deve ser menor que o horário final.',
      );
    }
  }

  private periodsOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string,
  ) {
    const aStart =
      this.timeToMinutes(start1);

    const aEnd =
      this.timeToMinutes(end1);

    const bStart =
      this.timeToMinutes(start2);

    const bEnd =
      this.timeToMinutes(end2);

    return (
      aStart < bEnd &&
      aEnd > bStart
    );
  }

  private parseCalendarDate(
    value: string,
  ) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        value,
      )
    ) {
      throw new BadRequestException(
        'Data inválida.',
      );
    }

    /*
     * Meio-dia reduz risco de mudança
     * de data causada por timezone.
     */
    const date = new Date(
      `${value}T12:00:00`,
    );

    if (
      Number.isNaN(date.getTime())
    ) {
      throw new BadRequestException(
        'Data inválida.',
      );
    }

    return date;
  }

  private getDayBounds(date: Date) {
    const start =
      new Date(date);

    start.setHours(
      0,
      0,
      0,
      0,
    );

    const end =
      new Date(date);

    end.setHours(
      23,
      59,
      59,
      999,
    );

    return {
      start,
      end,
    };
  }

  private dateWithTime(
    date: Date,
    time: string,
  ) {
    const [hours, minutes] =
      time
        .split(':')
        .map(Number);

    const result =
      new Date(date);

    result.setHours(
      hours,
      minutes,
      0,
      0,
    );

    return result;
  }

  private intervalsOverlap(
    start1: Date,
    end1: Date,
    start2: Date,
    end2: Date,
  ) {
    return (
      start1 < end2 &&
      end1 > start2
    );
  }

  private async ensureProfessional(
    professionalId: string,
  ) {
    if (!professionalId) {
      throw new BadRequestException(
        'Profissional não identificado.',
      );
    }

    const professional =
      await this.prisma.professional.findUnique({
        where: {
          id: professionalId,
        },
      });

    if (!professional) {
      throw new NotFoundException(
        'Profissional não encontrado.',
      );
    }

    return professional;
  }

  private async findOwnedAvailability(
    id: string,
    professionalId: string,
  ) {
    const availability =
      await this.prisma.availability.findFirst({
        where: {
          id,
          professionalId,
        },

        include: {
          periods: {
            orderBy: {
              startTime: 'asc',
            },
          },
        },
      });

    if (!availability) {
      throw new NotFoundException(
        'Disponibilidade não encontrada.',
      );
    }

    return availability;
  }

  private async findOwnedPeriod(
    id: string,
    professionalId: string,
  ) {
    const period =
      await this.prisma.availabilityPeriod.findUnique({
        where: {
          id,
        },

        include: {
          availability: {
            select: {
              professionalId: true,
            },
          },
        },
      });

    if (
      !period ||
      period.availability.professionalId !==
        professionalId
    ) {
      throw new NotFoundException(
        'Período não encontrado.',
      );
    }

    return period;
  }

  private async findOwnedException(
    id: string,
    professionalId: string,
  ) {
    const exception =
      await this.prisma.availabilityException.findFirst({
        where: {
          id,
          professionalId,
        },
      });

    if (!exception) {
      throw new NotFoundException(
        'Bloqueio não encontrado.',
      );
    }

    return exception;
  }

  /*
   * ============================================================
   * AVAILABILITY SEMANAL
   * ============================================================
   */

  async create(
    professionalId: string,
    dto: CreateAvailabilityDto,
  ) {
    await this.ensureProfessional(
      professionalId,
    );

    const availability =
      await this.prisma.availability.upsert({
        where: {
          professionalId_dayOfWeek:
            {
              professionalId,
              dayOfWeek:
                dto.dayOfWeek,
            },
        },

        update:
          dto.isActive ===
          undefined
            ? {}
            : {
                isActive:
                  dto.isActive,
              },

        create: {
          professionalId,
          dayOfWeek:
            dto.dayOfWeek,
          isActive:
            dto.isActive ??
            true,
        },

        include: {
          periods: {
            orderBy: {
              startTime:
                'asc',
            },
          },
        },
      });

    return availability;
  }

  async findMine(
    professionalId: string,
  ) {
    await this.ensureProfessional(
      professionalId,
    );

    return this.prisma.availability.findMany({
      where: {
        professionalId,
      },

      include: {
        periods: {
          orderBy: {
            startTime: 'asc',
          },
        },
      },

      orderBy: {
        dayOfWeek: 'asc',
      },
    });
  }

  async findAllByProfessional(
    professionalId: string,
  ) {
    await this.ensureProfessional(
      professionalId,
    );

    return this.prisma.availability.findMany({
      where: {
        professionalId,
      },

      include: {
        periods: {
          orderBy: {
            startTime: 'asc',
          },
        },
      },

      orderBy: {
        dayOfWeek: 'asc',
      },
    });
  }

  async findOne(
    id: string,
    professionalId: string,
  ) {
    return this.findOwnedAvailability(
      id,
      professionalId,
    );
  }

  async update(
    id: string,
    professionalId: string,
    dto: UpdateAvailabilityDto,
  ) {
    await this.findOwnedAvailability(
      id,
      professionalId,
    );

    return this.prisma.availability.update({
      where: {
        id,
      },

      data: dto,

      include: {
        periods: {
          orderBy: {
            startTime: 'asc',
          },
        },
      },
    });
  }

  async remove(
    id: string,
    professionalId: string,
  ) {
    await this.findOwnedAvailability(
      id,
      professionalId,
    );

    return this.prisma.availability.delete({
      where: {
        id,
      },
    });
  }

  /*
   * ============================================================
   * PERÍODOS
   * ============================================================
   */

  async createPeriod(
    availabilityId: string,
    professionalId: string,
    dto: CreateAvailabilityPeriodDto,
  ) {
    this.validatePeriod(
      dto.startTime,
      dto.endTime,
    );

    const availability =
      await this.findOwnedAvailability(
        availabilityId,
        professionalId,
      );

    const overlap =
      availability.periods.some(
        (period) =>
          this.periodsOverlap(
            dto.startTime,
            dto.endTime,
            period.startTime,
            period.endTime,
          ),
      );

    if (overlap) {
      throw new ConflictException(
        'Este período se sobrepõe a outro horário já configurado.',
      );
    }

    return this.prisma.availabilityPeriod.create({
      data: {
        availabilityId,
        startTime:
          dto.startTime,
        endTime: dto.endTime,
      },
    });
  }

  async updatePeriod(
    periodId: string,
    professionalId: string,
    dto: UpdateAvailabilityPeriodDto,
  ) {
    const current =
      await this.findOwnedPeriod(
        periodId,
        professionalId,
      );

    const startTime =
      dto.startTime ??
      current.startTime;

    const endTime =
      dto.endTime ??
      current.endTime;

    this.validatePeriod(
      startTime,
      endTime,
    );

    const otherPeriods =
      await this.prisma.availabilityPeriod.findMany({
        where: {
          availabilityId:
            current.availabilityId,

          id: {
            not: periodId,
          },
        },
      });

    const overlap =
      otherPeriods.some(
        (period) =>
          this.periodsOverlap(
            startTime,
            endTime,
            period.startTime,
            period.endTime,
          ),
      );

    if (overlap) {
      throw new ConflictException(
        'Este período se sobrepõe a outro horário já configurado.',
      );
    }

    return this.prisma.availabilityPeriod.update({
      where: {
        id: periodId,
      },

      data: {
        startTime,
        endTime,
      },
    });
  }

  async removePeriod(
    periodId: string,
    professionalId: string,
  ) {
    await this.findOwnedPeriod(
      periodId,
      professionalId,
    );

    return this.prisma.availabilityPeriod.delete({
      where: {
        id: periodId,
      },
    });
  }

  /*
   * ============================================================
   * EXCEÇÕES / BLOQUEIOS
   * ============================================================
   */

  async findExceptions(
    professionalId: string,
    startDate?: string,
    endDate?: string,
  ) {
    await this.ensureProfessional(
      professionalId,
    );

    const where: {
      professionalId: string;
      date?: {
        gte: Date;
        lte: Date;
      };
    } = {
      professionalId,
    };

    if (
      startDate &&
      endDate
    ) {
      const start =
        this.parseCalendarDate(
          startDate,
        );

      const end =
        this.parseCalendarDate(
          endDate,
        );

      if (start > end) {
        throw new BadRequestException(
          'A data inicial deve ser menor ou igual à data final.',
        );
      }

      const startBounds =
        this.getDayBounds(
          start,
        );

      const endBounds =
        this.getDayBounds(
          end,
        );

      where.date = {
        gte: startBounds.start,
        lte: endBounds.end,
      };
    }

    return this.prisma.availabilityException.findMany({
      where,

      orderBy: [
        {
          date: 'asc',
        },
        {
          startTime: 'asc',
        },
      ],
    });
  }

  async createException(
    professionalId: string,
    dto: CreateAvailabilityExceptionDto,
  ) {
    await this.ensureProfessional(
      professionalId,
    );

    const date =
      this.parseCalendarDate(
        dto.date,
      );

    const allDay =
      dto.allDay ??
      false;

    if (!allDay) {
      if (
        !dto.startTime ||
        !dto.endTime
      ) {
        throw new BadRequestException(
          'Início e fim são obrigatórios para bloqueios parciais.',
        );
      }

      this.validatePeriod(
        dto.startTime,
        dto.endTime,
      );
    }

    const {
      start,
      end,
    } =
      this.getDayBounds(
        date,
      );

    const existingExceptions =
      await this.prisma.availabilityException.findMany({
        where: {
          professionalId,

          date: {
            gte: start,
            lte: end,
          },
        },
      });

    /*
     * Já existe bloqueio integral.
     */
    if (
      existingExceptions.some(
        (exception) =>
          exception.allDay,
      )
    ) {
      throw new ConflictException(
        'Esta data já está bloqueada por completo.',
      );
    }

    /*
     * Se criar bloqueio integral,
     * não permitimos coexistir com
     * bloqueios parciais.
     */
    if (
      allDay &&
      existingExceptions.length >
        0
    ) {
      throw new ConflictException(
        'Remova os bloqueios parciais antes de bloquear o dia inteiro.',
      );
    }

    /*
     * Impede sobreposição entre bloqueios.
     */
    if (
      !allDay &&
      dto.startTime &&
      dto.endTime
    ) {
      const overlap =
        existingExceptions.some(
          (exception) => {
            if (
              !exception.startTime ||
              !exception.endTime
            ) {
              return false;
            }

            return this.periodsOverlap(
              dto.startTime!,
              dto.endTime!,
              exception.startTime,
              exception.endTime,
            );
          },
        );

      if (overlap) {
        throw new ConflictException(
          'Este bloqueio se sobrepõe a outro bloqueio existente.',
        );
      }
    }

    /*
     * Não permite criar bloqueio
     * por cima de appointment ativo.
     */
    const appointments =
      await this.prisma.appointment.findMany({
        where: {
          professionalId,

          status: {
            in: [
              'PENDING',
              'CONFIRMED',
            ],
          },

          date: {
            gte: start,
            lte: end,
          },
        },

        include: {
          service: true,
        },
      });

    if (
      allDay &&
      appointments.length > 0
    ) {
      throw new ConflictException(
        'Não é possível bloquear o dia inteiro porque existem agendamentos ativos nesta data.',
      );
    }

    if (
      !allDay &&
      dto.startTime &&
      dto.endTime
    ) {
      const blockStart =
        this.dateWithTime(
          date,
          dto.startTime,
        );

      const blockEnd =
        this.dateWithTime(
          date,
          dto.endTime,
        );

      const conflict =
        appointments.some(
          (appointment) => {
            const appointmentEnd =
              new Date(
                appointment.date.getTime() +
                  appointment
                    .service
                    .durationMinutes *
                    60 *
                    1000,
              );

            return this.intervalsOverlap(
              blockStart,
              blockEnd,
              appointment.date,
              appointmentEnd,
            );
          },
        );

      if (conflict) {
        throw new ConflictException(
          'Não é possível bloquear este período porque existe um agendamento ativo.',
        );
      }
    }

    return this.prisma.availabilityException.create({
      data: {
        professionalId,
        date,
        allDay,

        startTime: allDay
          ? null
          : dto.startTime,

        endTime: allDay
          ? null
          : dto.endTime,

        reason:
          dto.reason?.trim() ||
          null,
      },
    });
  }

  async removeException(
    id: string,
    professionalId: string,
  ) {
    await this.findOwnedException(
      id,
      professionalId,
    );

    return this.prisma.availabilityException.delete({
      where: {
        id,
      },
    });
  }

  /*
   * Utilizado por outras partes
   * que precisarem consultar a
   * rotina semanal.
   */
  async getWorkingHours(
    professionalId: string,
    dayOfWeek: number,
  ) {
    return this.prisma.availability.findUnique({
      where: {
        professionalId_dayOfWeek:
          {
            professionalId,
            dayOfWeek,
          },
      },

      include: {
        periods: {
          orderBy: {
            startTime: 'asc',
          },
        },
      },
    });
  }
}