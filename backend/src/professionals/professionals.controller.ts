import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ProfessionalsService } from './professionals.service';
import { UpdateProfessionalProfileDto } from './dto/update-professional-profile.dto';
import { FindProfessionalsDto } from './dto/find-professionals.dto';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('professionals')
export class ProfessionalsController {
  constructor(private readonly professionalsService: ProfessionalsService) {}

  @Get()
  getAll(@Query() query: FindProfessionalsDto) {
    return this.professionalsService.findAll(query);
  }

  /*
   * ============================================================
   * PROFISSIONAL AUTENTICADO
   * IMPORTANTE: antes de :id
   * ============================================================
   */

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(
    @Req()
    req: any,
  ) {
    return this.professionalsService.findOneById(req.user?.professionalId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/profile')
  updateMyProfile(
    @Req()
    req: any,

    @Body()
    dto: UpdateProfessionalProfileDto,
  ) {
    return this.professionalsService.updateProfile(
      req.user?.professionalId,
      dto,
    );
  }

  /*
   * ============================================================
   * ROTA PÚBLICA
   * ============================================================
   */

  @Get('slug/:slug')
  getBySlug(
    @Param('slug')
    slug: string,
  ) {
    return this.professionalsService.findOneBySlug(slug);
  }

  /*
   * ============================================================
   * POR ID
   * ============================================================
   */

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getById(
    @Param('id')
    id: string,
  ) {
    return this.professionalsService.findOneById(id);
  }
}
