import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AppointmentCancelledBy, AppointmentStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /*
   * ============================================================
   * HELPERS
   * ============================================================
   */

  private normalizePhone(value: string) {
    return value.replace(/\D/g, '');
  }

  private getLocalPhone(value: string) {
    const digits = this.normalizePhone(value);

    if (digits.startsWith('55') && digits.length > 11) {
      return digits.substring(2);
    }

    return digits;
  }

  private getDayBounds(date: Date) {
    const start = new Date(date);

    start.setHours(0, 0, 0, 0);

    const end = new Date(date);

    end.setHours(23, 59, 59, 999);

    return {
      start,
      end,
    };
  }

  private dateWithTime(date: Date, time: string) {
    const [hours, minutes] = time.split(':').map(Number);

    const result = new Date(date);

    result.setHours(hours, minutes, 0, 0);

    return result;
  }

  private intervalsOverlap(start1: Date, end1: Date, start2: Date, end2: Date) {
    return start1 < end2 && end1 > start2;
  }

  private fitsInsidePeriod(
    start: Date,
    end: Date,
    date: Date,
    periods: {
      startTime: string;
      endTime: string;
    }[],
  ) {
    return periods.some((period) => {
      const periodStart = this.dateWithTime(date, period.startTime);

      const periodEnd = this.dateWithTime(date, period.endTime);

      return start >= periodStart && end <= periodEnd;
    });
  }

  private hitsException(
    start: Date,
    end: Date,
    date: Date,
    exceptions: {
      allDay: boolean;
      startTime: string | null;
      endTime: string | null;
    }[],
  ) {
    if (exceptions.some((exception) => exception.allDay)) {
      return true;
    }

    return exceptions.some((exception) => {
      if (!exception.startTime || !exception.endTime) {
        return false;
      }

      const blockStart = this.dateWithTime(date, exception.startTime);

      const blockEnd = this.dateWithTime(date, exception.endTime);

      return this.intervalsOverlap(start, end, blockStart, blockEnd);
    });
  }

  private async getSchedule(professionalId: string, date: Date) {
    const dayOfWeek = date.getDay();

    const availability = await this.prisma.availability.findUnique({
      where: {
        professionalId_dayOfWeek: {
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

    const { start, end } = this.getDayBounds(date);

    const exceptions = await this.prisma.availabilityException.findMany({
      where: {
        professionalId,

        date: {
          gte: start,
          lte: end,
        },
      },
    });

    return {
      availability,
      exceptions,
      dayStart: start,
      dayEnd: end,
    };
  }

  /*
   * ============================================================
   * CRIAR AGENDAMENTO
   * ============================================================
   */

  async create(dto: CreateAppointmentDto) {
    const appointmentDate = new Date(dto.dateTime);

    if (Number.isNaN(appointmentDate.getTime())) {
      throw new BadRequestException('Data inválida.');
    }

    if (appointmentDate < new Date()) {
      throw new BadRequestException(
        'Não é possível agendar em uma data passada.',
      );
    }

    const professional = await this.prisma.professional.findUnique({
      where: {
        id: dto.professionalId,
      },
    });

    if (!professional) {
      throw new NotFoundException('Profissional não encontrado.');
    }

    const service = await this.prisma.service.findFirst({
      where: {
        id: dto.serviceId,
        professionalId: dto.professionalId,
        isActive: true,
      },
    });

    if (!service) {
      throw new NotFoundException('Serviço não encontrado ou indisponível.');
    }

    const appointmentEnd = new Date(
      appointmentDate.getTime() + service.durationMinutes * 60 * 1000,
    );

    const { availability, exceptions, dayStart, dayEnd } =
      await this.getSchedule(dto.professionalId, appointmentDate);

    if (
      !availability ||
      !availability.isActive ||
      availability.periods.length === 0
    ) {
      throw new BadRequestException('O profissional não atende neste dia.');
    }

    /*
     * Precisa caber completamente
     * dentro de UM período.
     */
    if (
      !this.fitsInsidePeriod(
        appointmentDate,
        appointmentEnd,
        appointmentDate,
        availability.periods,
      )
    ) {
      throw new BadRequestException(
        'O serviço não cabe integralmente em um período de atendimento disponível.',
      );
    }

    if (
      this.hitsException(
        appointmentDate,
        appointmentEnd,
        appointmentDate,
        exceptions,
      )
    ) {
      throw new ConflictException(
        'Este horário está bloqueado pelo profissional.',
      );
    }

    const existingAppointments = await this.prisma.appointment.findMany({
      where: {
        professionalId: dto.professionalId,

        status: {
          in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
        },

        date: {
          gte: dayStart,
          lte: dayEnd,
        },
      },

      include: {
        service: true,
      },
    });

    const hasConflict = existingAppointments.some((existing) => {
      const existingEnd = new Date(
        existing.date.getTime() + existing.service.durationMinutes * 60 * 1000,
      );

      return this.intervalsOverlap(
        appointmentDate,
        appointmentEnd,
        existing.date,
        existingEnd,
      );
    });

    if (hasConflict) {
      throw new ConflictException('Este horário já está preenchido.');
    }

    const normalizedPhone = this.normalizePhone(dto.clientWhats);

    if (normalizedPhone.length < 10) {
      throw new BadRequestException('WhatsApp inválido.');
    }

    let customer = await this.prisma.customer.findFirst({
      where: {
        phone: normalizedPhone,
      },
    });

    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          name: dto.clientName.trim(),

          phone: normalizedPhone,
        },
      });
    }

    return this.prisma.appointment.create({
      data: {
        professionalId: dto.professionalId,

        serviceId: dto.serviceId,

        customerId: customer.id,

        date: appointmentDate,

        status: AppointmentStatus.PENDING,
      },

      include: {
        professional: true,
        service: true,
        customer: true,
      },
    });
  }

  /*
   * ============================================================
   * HORÁRIOS DISPONÍVEIS
   * ============================================================
   */

  async findAvailableSlots(
    dateString: string,
    professionalId: string,
    serviceId: string,
  ) {
    if (!dateString || !professionalId || !serviceId) {
      throw new BadRequestException(
        'Data, profissional e serviço são obrigatórios.',
      );
    }

    const service = await this.prisma.service.findFirst({
      where: {
        id: serviceId,
        professionalId,
        isActive: true,
      },
    });

    if (!service) {
      throw new NotFoundException('Serviço não encontrado ou indisponível.');
    }

    const targetDate = new Date(`${dateString}T12:00:00`);

    if (Number.isNaN(targetDate.getTime())) {
      throw new BadRequestException('Data inválida.');
    }

    const { availability, exceptions, dayStart, dayEnd } =
      await this.getSchedule(professionalId, targetDate);

    if (
      !availability ||
      !availability.isActive ||
      availability.periods.length === 0
    ) {
      return {
        available: false,
        slots: [],
        message: 'Profissional não atende neste dia.',
      };
    }

    if (exceptions.some((exception) => exception.allDay)) {
      return {
        available: false,
        slots: [],
        message: 'Profissional indisponível nesta data.',
      };
    }

    const appointments = await this.prisma.appointment.findMany({
      where: {
        professionalId,

        status: {
          in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
        },

        date: {
          gte: dayStart,
          lte: dayEnd,
        },
      },

      include: {
        service: true,
      },
    });

    const slots: {
      time: string;
      available: boolean;
    }[] = [];

    const now = new Date();

    for (const period of availability.periods) {
      let current = this.dateWithTime(targetDate, period.startTime);

      const periodEnd = this.dateWithTime(targetDate, period.endTime);

      while (current < periodEnd) {
        const slotEnd = new Date(
          current.getTime() + service.durationMinutes * 60 * 1000,
        );

        if (slotEnd > periodEnd) {
          break;
        }

        const isPast = current <= now;

        const isBooked = appointments.some((appointment) => {
          const bookedEnd = new Date(
            appointment.date.getTime() +
              appointment.service.durationMinutes * 60 * 1000,
          );

          return this.intervalsOverlap(
            current,
            slotEnd,
            appointment.date,
            bookedEnd,
          );
        });

        const isBlocked = this.hitsException(
          current,
          slotEnd,
          targetDate,
          exceptions,
        );

        slots.push({
          time: current.toTimeString().substring(0, 5),

          available: !isPast && !isBooked && !isBlocked,
        });

        /*
         * Mantém o comportamento existente:
         * intervalo entre opções =
         * duração do serviço.
         */
        current = new Date(
          current.getTime() + service.durationMinutes * 60 * 1000,
        );
      }
    }

    slots.sort((a, b) => a.time.localeCompare(b.time));

    return {
      available: slots.some((slot) => slot.available),

      slots,

      service: {
        id: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
      },
    };
  }

  /*
   * ============================================================
   * CONSULTAS
   * ============================================================
   */

  async findAll() {
    return this.prisma.appointment.findMany({
      include: {
        professional: true,
        service: true,
        customer: true,
      },
    });
  }

  async findOne(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: {
        id,
      },

      include: {
        professional: true,
        service: true,
        customer: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException(`Agendamento ${id} não encontrado.`);
    }

    return appointment;
  }

  async findByProfessional(professionalId: string, date?: string) {
    if (!professionalId) {
      throw new BadRequestException('Profissional não identificado.');
    }

    const where: any = {
      professionalId,
    };

    if (date) {
      const target = new Date(`${date}T12:00:00`);

      const { start, end } = this.getDayBounds(target);

      where.date = {
        gte: start,
        lte: end,
      };
    }

    return this.prisma.appointment.findMany({
      where,

      include: {
        professional: true,
        service: true,
        customer: true,
      },

      orderBy: {
        date: 'asc',
      },
    });
  }

  async findByPhone(phone: string, professionalId?: string) {
    const normalized = this.normalizePhone(phone);

    if (!normalized || normalized.length < 10) {
      throw new BadRequestException('Telefone inválido.');
    }

    const localPhone = this.getLocalPhone(normalized);

    const customers = await this.prisma.customer.findMany({
      where: {
        OR: [
          {
            phone: normalized,
          },

          {
            phone: localPhone,
          },

          {
            phone: `55${localPhone}`,
          },

          {
            phone: {
              endsWith: localPhone,
            },
          },
        ],
      },

      select: {
        id: true,
      },
    });

    if (customers.length === 0) {
      throw new NotFoundException(
        'Nenhum cliente encontrado para este telefone.',
      );
    }

    const customerIds = customers.map((customer) => customer.id);

    return this.prisma.appointment.findMany({
      where: {
        customerId: {
          in: customerIds,
        },

        ...(professionalId
          ? {
              professionalId,
            }
          : {}),
      },

      include: {
        professional: true,
        service: true,
        customer: true,
      },

      orderBy: {
        date: 'desc',
      },
    });
  }

  /*
   * ============================================================
   * STATUS PELO PROFISSIONAL
   * ============================================================
   */

  async updateStatus(
    id: string,
    status: AppointmentStatus,
    professionalId: string,
    reason?: string,
  ) {
    if (!professionalId) {
      throw new BadRequestException('Profissional não identificado.');
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        professionalId,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    const allowedTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
      PENDING: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],

      CONFIRMED: [
        AppointmentStatus.COMPLETED,
        AppointmentStatus.CANCELLED,
        AppointmentStatus.NO_SHOW,
      ],

      CANCELLED: [],
      COMPLETED: [],
      NO_SHOW: [],
    };

    if (!allowedTransitions[appointment.status].includes(status)) {
      throw new BadRequestException(
        'Esta alteração de status não é permitida.',
      );
    }

    if (status === AppointmentStatus.CANCELLED) {
      const cancellationReason = reason?.trim();

      if (!cancellationReason) {
        throw new BadRequestException('Informe o motivo do cancelamento.');
      }

      return this.prisma.appointment.update({
        where: {
          id,
        },

        data: {
          status: AppointmentStatus.CANCELLED,

          cancelledBy: AppointmentCancelledBy.PROFESSIONAL,

          cancellationReason,

          cancelledAt: new Date(),
        },

        include: {
          professional: true,
          service: true,
          customer: true,
        },
      });
    }

    return this.prisma.appointment.update({
      where: {
        id,
      },

      data: {
        status,
      },

      include: {
        professional: true,
        service: true,
        customer: true,
      },
    });
  }

  /*
   * ============================================================
   * LIMPEZA
   * ============================================================
   */

  async cleanup(professionalId: string) {
    if (!professionalId) {
      throw new BadRequestException('Profissional não identificado.');
    }

    /*
     * Só removemos estados finalizados.
     *
     * PENDING e CONFIRMED são preservados
     * porque ainda exigem ação ou atendimento.
     */
    const removableStatuses: AppointmentStatus[] = [
      AppointmentStatus.CANCELLED,
      AppointmentStatus.COMPLETED,
      AppointmentStatus.NO_SHOW,
    ];

    const appointments = await this.prisma.appointment.findMany({
      where: {
        professionalId,

        status: {
          in: removableStatuses,
        },
      },

      select: {
        id: true,
      },
    });

    const ids = appointments.map((appointment) => appointment.id);

    if (ids.length === 0) {
      return {
        count: 0,
        deletedIds: [],
        message: 'Nenhum agendamento finalizado para remover.',
      };
    }

    const result = await this.prisma.appointment.deleteMany({
      where: {
        professionalId,

        id: {
          in: ids,
        },

        /*
         * Segurança extra.
         */
        status: {
          in: removableStatuses,
        },
      },
    });

    return {
      count: result.count,

      deletedIds: ids,

      message: `${result.count} agendamento(s) removido(s).`,
    };
  }

  /*
   * ============================================================
   * CANCELAMENTO PELO CLIENTE
   * ============================================================
   */

  async cancelPublic(id: string, phone: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: {
        id,
      },

      include: {
        customer: true,
      },
    });

    if (!appointment || !appointment.customer) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    const informedPhone = this.getLocalPhone(phone);

    const customerPhone = this.getLocalPhone(appointment.customer.phone);

    if (informedPhone !== customerPhone) {
      throw new NotFoundException(
        'Agendamento não encontrado para este telefone.',
      );
    }

    const cancellableStatuses: AppointmentStatus[] = [
      AppointmentStatus.PENDING,
      AppointmentStatus.CONFIRMED,
    ];

    if (!cancellableStatuses.includes(appointment.status)) {
      throw new BadRequestException(
        'Este agendamento não pode mais ser cancelado.',
      );
    }

    if (appointment.date <= new Date()) {
      throw new BadRequestException(
        'Não é possível cancelar um agendamento que já iniciou.',
      );
    }

    return this.prisma.appointment.update({
      where: {
        id,
      },

      data: {
        status: AppointmentStatus.CANCELLED,

        cancelledBy: AppointmentCancelledBy.CUSTOMER,

        cancellationReason: null,

        cancelledAt: new Date(),
      },
    });
  }

  async remove(id: string, professionalId: string) {
    if (!professionalId) {
      throw new BadRequestException('Profissional não identificado.');
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        professionalId,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    /*
     * Não deixamos apagar um agendamento
     * que ainda precisa ser atendido.
     */
    const removableStatuses: AppointmentStatus[] = [
      AppointmentStatus.CANCELLED,
      AppointmentStatus.COMPLETED,
      AppointmentStatus.NO_SHOW,
    ];

    if (!removableStatuses.includes(appointment.status)) {
      throw new BadRequestException(
        'Somente agendamentos cancelados, concluídos ou marcados como não compareceu podem ser excluídos.',
      );
    }

    await this.prisma.appointment.delete({
      where: {
        id,
      },
    });

    return {
      id,
      message: 'Agendamento removido com sucesso.',
    };
  }
}
