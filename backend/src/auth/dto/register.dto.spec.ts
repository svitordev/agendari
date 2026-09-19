import { ValidationPipe } from '@nestjs/common';
import { RegisterDto } from './register.dto';

function createValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
}

describe('RegisterDto — ValidationPipe REAL', () => {
  const pipe = createValidationPipe();

  async function transformWithMetatype(input: Record<string, unknown>) {
    return pipe.transform(input, {
      type: 'body',
      metatype: RegisterDto,
      data: '',
    } as any);
  }

  describe('validação de senha', () => {
    it('password ausente → 400', async () => {
      await expect(
        transformWithMetatype({
          email: 'test@example.com',
          password: undefined,
          firstName: 'Test',
          lastName: 'User',
        }),
      ).rejects.toThrow();
    });

    it('password="" → 400', async () => {
      await expect(
        transformWithMetatype({
          email: 'test@example.com',
          password: '',
          firstName: 'Test',
          lastName: 'User',
        }),
      ).rejects.toThrow();
    });

    it('password="1234567" (7 chars) → 400', async () => {
      await expect(
        transformWithMetatype({
          email: 'test@example.com',
          password: '1234567',
          firstName: 'Test',
          lastName: 'User',
        }),
      ).rejects.toThrow();
    });

    it('password="12345678" (8 chars) → válido', async () => {
      const result = await transformWithMetatype({
        email: 'test@example.com',
        password: '12345678',
        firstName: 'Test',
        lastName: 'User',
      });
      expect(result.password).toBe('12345678');
    });

    it('password com mais de 8 caracteres → válido', async () => {
      const result = await transformWithMetatype({
        email: 'test@example.com',
        password: 'senha-segura-123',
        firstName: 'Test',
        lastName: 'User',
      });
      expect(result.password).toBe('senha-segura-123');
    });

    it('campo desconhecido → 400', async () => {
      await expect(
        transformWithMetatype({
          email: 'test@example.com',
          password: '12345678',
          firstName: 'Test',
          lastName: 'User',
          campoExtra: 'x',
        }),
      ).rejects.toThrow();
    });

    it('email inválido → 400', async () => {
      await expect(
        transformWithMetatype({
          email: 'notanemail',
          password: '12345678',
          firstName: 'Test',
          lastName: 'User',
        }),
      ).rejects.toThrow();
    });
  });
});
