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

import { AvailabilitiesService } from './availabilities.service';

import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';

import { CreateAvailabilityPeriodDto } from './dto/create-availability-period.dto';
import { UpdateAvailabilityPeriodDto } from './dto/update-availability-period.dto';

import { CreateAvailabilityExceptionDto } from './dto/create-availability-exception.dto';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('availabilities')
export class AvailabilitiesController {
  constructor(private readonly service: AvailabilitiesService) {}

  /*
   * =========================================================
   * PROFISSIONAL AUTENTICADO
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Get()
  findMine(@Req() req: any) {
    return this.service.findMine(req.user?.professionalId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Req() req: any,
    @Body()
    dto: CreateAvailabilityDto,
  ) {
    return this.service.create(req.user?.professionalId, dto);
  }

  /*
   * =========================================================
   * EXCEÇÕES
   * IMPORTANTE: antes de :id
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Get('exceptions')
  findExceptions(
    @Req() req: any,
    @Query('startDate')
    startDate?: string,
    @Query('endDate')
    endDate?: string,
  ) {
    return this.service.findExceptions(
      req.user?.professionalId,
      startDate,
      endDate,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('exceptions')
  createException(
    @Req() req: any,
    @Body()
    dto: CreateAvailabilityExceptionDto,
  ) {
    return this.service.createException(req.user?.professionalId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('exceptions/:id')
  removeException(@Req() req: any, @Param('id') id: string) {
    return this.service.removeException(id, req.user?.professionalId);
  }

  /*
   * =========================================================
   * PERÍODOS
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Post(':id/periods')
  createPeriod(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    dto: CreateAvailabilityPeriodDto,
  ) {
    return this.service.createPeriod(id, req.user?.professionalId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('periods/:periodId')
  updatePeriod(
    @Req() req: any,
    @Param('periodId')
    periodId: string,
    @Body()
    dto: UpdateAvailabilityPeriodDto,
  ) {
    return this.service.updatePeriod(periodId, req.user?.professionalId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('periods/:periodId')
  removePeriod(
    @Req() req: any,
    @Param('periodId')
    periodId: string,
  ) {
    return this.service.removePeriod(periodId, req.user?.professionalId);
  }

  /*
   * =========================================================
   * PÚBLICO
   * Mantemos para compatibilidade.
   * =========================================================
   */

  @Get('professional/:id')
  findByProfessional(@Param('id') id: string) {
    return this.service.findAllByProfessional(id);
  }

  /*
   * =========================================================
   * CRUD ADMINISTRATIVO
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.service.findOne(id, req.user?.professionalId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    dto: UpdateAvailabilityDto,
  ) {
    return this.service.update(id, req.user?.professionalId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.remove(id, req.user?.professionalId);
  }
}
