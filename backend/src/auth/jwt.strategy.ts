import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ProfessionalStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireJwtSecret } from './jwt-validation';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireJwtSecret(),
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        professional: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado.');
    }

    /*
     * Estado operacional: Professional suspenso perde acesso às
     * áreas privadas mesmo com JWT válido emitido antes da
     * suspensão — esta consulta ao banco já roda em toda request,
     * então o bloqueio é imediato na próxima request autenticada.
     *
     * Especificamente Role.PROFESSIONAL + Professional SUSPENDED:
     * ADMIN (professional null ou ACTIVE) nunca é bloqueado por
     * este check. A exceção HTTP é propagada pela cadeia
     * Passport→AuthGuard→ExceptionHandler como 403 (coberto por
     * teste de integração com a cadeia real).
     */
    if (
      user.role === Role.PROFESSIONAL &&
      user.professional?.status === ProfessionalStatus.SUSPENDED
    ) {
      throw new ForbiddenException(
        'Conta suspensa. Entre em contato com o administrador.',
      );
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      professionalId: user.professional?.id,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }
}