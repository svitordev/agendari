import { Injectable, ConflictException, ForbiddenException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ProfessionalStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    // Verificar se o e-mail já existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Este e-mail já está cadastrado.');
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Criar o usuário
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: 'PROFESSIONAL',
      },
    });

    // Gerar token
    const payload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async login(dto: LoginDto) {
    // Buscar usuário pelo e-mail
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        professional: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    // Verificar a senha
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    /*
     * Suspensão verificada SOMENTE após a senha correta — antes
     * disso o login viraria enumeração de status (revelaria contas
     * suspensas a quem não sabe a senha). Credenciais inválidas
     * mantêm o comportamento atual (401 genérico). ADMIN e User
     * sem Professional não são afetados.
     */
    if (
      user.role === Role.PROFESSIONAL &&
      user.professional?.status === ProfessionalStatus.SUSPENDED
    ) {
      throw new ForbiddenException(
        'Conta suspensa. Entre em contato com o administrador.',
      );
    }

    // Gerar token JWT
    const payload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        professionalId: user.professional?.id,
      },
    };
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        professional: {
          select: {
            id: true,
            name: true,
            slug: true,
            bio: true,
            avatarUrl: true,
            instagram: true,
            themeColors: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    return user;
  }
}