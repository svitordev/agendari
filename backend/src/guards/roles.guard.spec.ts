import 'reflect-metadata';

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

/*
 * ============================================================
 * RolesGuard — testes unitários com Reflector REAL e
 * metadata real via @Roles (reflect-metadata).
 * Sem banco, sem HTTP — apenas a decisão do guard.
 * ============================================================
 */

class HandlerHost {
  @Roles(Role.ADMIN)
  adminOnly() {}

  noRoles() {}
}

@Roles(Role.ADMIN)
class ClassHost {
  inherited() {}
}

function createContext(user: unknown, handler: unknown, cls: unknown) {
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  const adminUser = { role: Role.ADMIN };
  const professionalUser = { role: Role.PROFESSIONAL };
  const userSemRole = {};

  it('1. sem metadata @Roles → permite', () => {
    const ctx = createContext(adminUser, HandlerHost.prototype.noRoles, HandlerHost);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('2. @Roles(ADMIN) no handler + req.user.role ADMIN → permite', () => {
    const ctx = createContext(adminUser, HandlerHost.prototype.adminOnly, HandlerHost);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('3. @Roles(ADMIN) no handler + req.user.role PROFESSIONAL → 403', () => {
    const ctx = createContext(
      professionalUser,
      HandlerHost.prototype.adminOnly,
      HandlerHost,
    );

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('4. role ausente no req.user → 403', () => {
    const ctx = createContext(userSemRole, HandlerHost.prototype.adminOnly, HandlerHost);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('5a. metadata na CLASSE é lida corretamente → ADMIN permite', () => {
    const ctx = createContext(adminUser, ClassHost.prototype.inherited, ClassHost);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('5b. metadata na CLASSE é lida corretamente → PROFESSIONAL 403', () => {
    const ctx = createContext(
      professionalUser,
      ClassHost.prototype.inherited,
      ClassHost,
    );

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
