import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

/*
 * ============================================================
 * Chave explícita da metadata de roles.
 * Usada pelo @Roles() e pelo RolesGuard (Reflector).
 * ============================================================
 */
export const ROLES_KEY = 'roles';

/*
 * Restringe a rota (ou o controller) às roles informadas.
 * Tipado pelo enum Role do Prisma — sem strings soltas.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
