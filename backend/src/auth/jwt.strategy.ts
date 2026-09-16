import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'pex_agendamento_secret_key_2026_change_me_in_production',
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