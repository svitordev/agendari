import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { AdminService } from './admin.service';
import { AdminListProfessionalsDto } from './dto/admin-list-professionals.dto';

/*
 * ============================================================
 * Fundação ADMIN da v1.1.
 *
 * Ordem dos guards importa: JwtAuthGuard primeiro (popula
 * req.user com a role vinda do banco), RolesGuard depois.
 *
 * Sem AdminService: sem lógica de negócio ainda — abstração
 * sem uso seria premature. /admin/professionals vem depois.
 * ============================================================
 */
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('me')
  getMe(@Req() req: any) {
    /*
     * Somente dados mínimos do usuário autenticado.
     * Sem password, sem tokens, sem relation Professional.
     */
    const { userId, email, firstName, lastName, role } = req.user;

    return { userId, email, firstName, lastName, role };
  }

  /*
   * ============================================================
   * Listagem administrativa read-only.
   * Mesma cadeia de guards da fundação: JwtAuthGuard popula
   * req.user (role do banco), RolesGuard aplica @Roles.
   * Controller fino: recebe DTO, delega ao AdminService.
   * ============================================================
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('professionals')
  listProfessionals(@Query() query: AdminListProfessionalsDto) {
    return this.adminService.listProfessionals(query);
  }
}
