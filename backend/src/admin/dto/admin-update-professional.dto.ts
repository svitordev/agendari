import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';

/*
 * ============================================================
 * DTO de edição administrativa (PATCH /admin/professionals/:id).
 *
 * PATCH completo: os 5 campos são sempre enviados pelo
 * formulário e todos obrigatórios (espelha o DTO de criação).
 * Sem merge parcial.
 *
 * Editáveis: Professional (name, slug) + User
 * (email, firstName, lastName).
 *
 * Proibidos no body (→ 400 via forbidNonWhitelisted do
 * ValidationPipe global): role, password, professionalId,
 * userId, id, createdAt, updatedAt. O ADMIN não altera role
 * nem senha por esta rota, e o cliente não controla ids nem
 * timestamps.
 *
 * Validações idênticas às do DTO de criação (mesmos padrões
 * do projeto — sem normalização de email, mesma regex de slug).
 * ============================================================
 */
export class AdminUpdateProfessionalDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome da profissional é obrigatório.' })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'O link personalizado deve conter apenas letras minúsculas, números e hifens. Sem espaços ou acentos.',
  })
  slug!: string;

  @IsEmail({}, { message: 'Digite um e-mail válido.' })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;
}
