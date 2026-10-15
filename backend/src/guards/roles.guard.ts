import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

/*
 * ============================================================
 * RolesGuard — autorização por role.
 *
 * - NÃO consulta o banco: a role confiável já vem do JwtStrategy
 *   (que carrega o User do banco a cada request).
 * - Sem @Roles na rota/classe → permite (guard defensivo; só
 *   bloqueia onde @Roles() é declarado explicitamente).
 * - Deve ser executado DEPOIS do JwtAuthGuard, que popula req.user.
 * ============================================================
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const role = request.user?.role;

    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException('Permissão insuficiente.');
    }

    return true;
  }
}
