import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';

import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  /*
   * ============================================================
   * PRIVADO — CRIAR SERVIÇO (profissional autenticado)
   * ============================================================
   *
   * professionalId vem exclusivamente do JWT (req.user).
   * O body NÃO recebe professionalId.
   */

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: any, @Body() dto: CreateServiceDto) {
    return this.servicesService.create(req.user.professionalId, dto);
  }

  /*
   * ============================================================
   * PÚBLICO — SERVIÇOS ATIVOS DE UM PROFISSIONAL
   * ============================================================
   *
   * Usado pela página pública /professional/[slug].
   * Retorna SOMENTE serviços com isActive = true.
   *
   * IMPORTANTE: esta rota deve ficar ANTES de GET :id
   * para que NestJS resolva a rota mais específica primeiro.
   */

  @Get('professional/:professionalId')
  findByProfessional(@Param('professionalId') professionalId: string) {
    return this.servicesService.findPublicByProfessional(professionalId);
  }

  /*
   * ============================================================
   * PRIVADO — LISTAR MEUS SERVIÇOS (dashboard)
   * ============================================================
   *
   * Retorna ativos + inativos do profissional autenticado.
   */

  @UseGuards(JwtAuthGuard)
  @Get()
  findMine(@Req() req: any) {
    return this.servicesService.findMine(req.user.professionalId);
  }

  /*
   * ============================================================
   * PRIVADO — BUSCAR UM SERVIÇO (com ownership)
   * ============================================================
   *
   * Só retorna o serviço se ele pertencer ao profissional autenticado.
   * Serviço de outro profissional → NotFoundException (404).
   */

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.servicesService.findOne(id, req.user.professionalId);
  }

  /*
   * ============================================================
   * PRIVADO — EDITAR SERVIÇO (com ownership)
   * ============================================================
   */

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.update(id, req.user.professionalId, dto);
  }

  /*
   * ============================================================
   * PRIVADO — EXCLUIR SERVIÇO (com ownership)
   * ============================================================
   */

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.servicesService.remove(id, req.user.professionalId);
  }
}