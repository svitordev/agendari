import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AppointmentsService } from './appointments.service';

import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { CancelPublicAppointmentDto } from './dto/cancel-public-appointment.dto';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
  ) {}

  /*
   * ============================================================
   * PÚBLICO: CRIAR AGENDAMENTO
   * ============================================================
   */

  @Post()
  create(
    @Body()
    dto: CreateAppointmentDto,
  ) {
    return this.appointmentsService.create(dto);
  }

  /*
   * ============================================================
   * PROFISSIONAL: LIMPAR FINALIZADOS
   * ============================================================
   *
   * Remove somente:
   *
   * CANCELLED
   * COMPLETED
   * NO_SHOW
   *
   * Nunca remove:
   *
   * PENDING
   * CONFIRMED
   *
   * IMPORTANTE:
   * Esta rota deve ficar antes de DELETE :id.
   */

  @UseGuards(JwtAuthGuard)
  @Delete('cleanup')
  cleanup(
    @Req()
    req: any,
  ) {
    return this.appointmentsService.cleanup(
      req.user?.professionalId,
    );
  }

  /*
   * ============================================================
   * PÚBLICO: HORÁRIOS DISPONÍVEIS
   * ============================================================
   */

  @Get('available')
  getAvailableSlots(
    @Query('date')
    date: string,

    @Query('professionalId')
    professionalId: string,

    @Query('serviceId')
    serviceId: string,
  ) {
    return this.appointmentsService.findAvailableSlots(
      date,
      professionalId,
      serviceId,
    );
  }

  /*
   * ============================================================
   * PÚBLICO: BUSCAR AGENDAMENTOS PELO WHATSAPP
   * ============================================================
   *
   * professionalId é opcional.
   *
   * Sem professionalId:
   * retorna agendamentos do telefone em todos os profissionais.
   *
   * Com professionalId:
   * retorna somente os agendamentos daquele profissional.
   */

  @Get('by-phone')
  getByPhone(
    @Query('phone')
    phone: string,

    @Query('professionalId')
    professionalId?: string,
  ) {
    return this.appointmentsService.findByPhone(
      phone,
      professionalId,
    );
  }

  /*
   * ============================================================
   * PROFISSIONAL: LISTAR MEUS AGENDAMENTOS
   * ============================================================
   */

  @UseGuards(JwtAuthGuard)
  @Get()
  findMyAppointments(
    @Req()
    req: any,

    @Query('date')
    date?: string,
  ) {
    return this.appointmentsService.findByProfessional(
      req.user?.professionalId,
      date,
    );
  }

  /*
   * ============================================================
   * PROFISSIONAL: ALTERAR STATUS
   * ============================================================
   *
   * Fluxos permitidos no service:
   *
   * PENDING
   *   -> CONFIRMED
   *   -> CANCELLED
   *
   * CONFIRMED
   *   -> COMPLETED
   *   -> CANCELLED
   *   -> NO_SHOW
   */

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  updateStatus(
    @Req()
    req: any,

    @Param('id')
    id: string,

    @Body()
    dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointmentsService.updateStatus(
      id,
      dto.status,
      req.user?.professionalId,
      dto.reason,
    );
  }

  /*
   * ============================================================
   * CLIENTE: CANCELAR AGENDAMENTO
   * ============================================================
   *
   * Rota pública.
   *
   * O service valida se o telefone informado pertence
   * realmente ao agendamento.
   */

  @Patch(':id/cancel-public')
  cancelPublic(
    @Param('id')
    id: string,

    @Body()
    dto: CancelPublicAppointmentDto,
  ) {
    return this.appointmentsService.cancelPublic(
      id,
      dto.phone,
    );
  }

  /*
   * ============================================================
   * PROFISSIONAL: EXCLUIR UM AGENDAMENTO FINALIZADO
   * ============================================================
   *
   * Só permite excluir:
   *
   * CANCELLED
   * COMPLETED
   * NO_SHOW
   *
   * O service também verifica se o agendamento
   * pertence ao profissional autenticado.
   *
   * PENDING e CONFIRMED não podem ser apagados.
   */

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(
    @Req()
    req: any,

    @Param('id')
    id: string,
  ) {
    return this.appointmentsService.remove(
      id,
      req.user?.professionalId,
    );
  }
}