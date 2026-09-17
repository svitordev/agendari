import 'reflect-metadata';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { FindProfessionalsDto } from './dto/find-professionals.dto';

describe('FindProfessionalsDto (ValidationPipe isolado)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  async function transformQuery(query: Record<string, unknown>) {
    const metadata: ArgumentMetadata = {
      type: 'query',
      metatype: FindProfessionalsDto,
      data: undefined,
    };
    return pipe.transform(query, metadata);
  }

  async function safeTransform(query: Record<string, unknown>) {
    try {
      const data = await transformQuery(query);
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  describe('conversão @Type(() => Number) + validações', () => {
    it('limit "20" → number 20 e válido', async () => {
      const result = await safeTransform({ limit: '20' });
      expect(result.ok).toBe(true);
      expect((result as any).data.limit).toBe(20);
      expect(typeof (result as any).data.limit).toBe('number');
    });

    it('offset "0" → number 0 e válido', async () => {
      const result = await safeTransform({ offset: '0' });
      expect(result.ok).toBe(true);
      expect((result as any).data.offset).toBe(0);
      expect(typeof (result as any).data.offset).toBe('number');
    });

    it('limit=20&offset=50 → ambos válidos', async () => {
      const result = await safeTransform({ limit: '20', offset: '50' });
      expect(result.ok).toBe(true);
      expect((result as any).data.limit).toBe(20);
      expect((result as any).data.offset).toBe(50);
    });
  });

  describe('limit inválido → 400', () => {
    it('limit "abc" → erro de validação', async () => {
      const result = await safeTransform({ limit: 'abc' });
      expect(result.ok).toBe(false);
      expect((result as any).error).toBeInstanceOf(BadRequestException);
    });

    it('limit "0" → @Min(1) falha', async () => {
      const result = await safeTransform({ limit: '0' });
      expect(result.ok).toBe(false);
      expect((result as any).error).toBeInstanceOf(BadRequestException);
    });

    it('limit "101" → @Max(100) falha', async () => {
      const result = await safeTransform({ limit: '101' });
      expect(result.ok).toBe(false);
      expect((result as any).error).toBeInstanceOf(BadRequestException);
    });

    it('limit "-1" → @Min(1) falha', async () => {
      const result = await safeTransform({ limit: '-1' });
      expect(result.ok).toBe(false);
      expect((result as any).error).toBeInstanceOf(BadRequestException);
    });
  });

  describe('offset inválido → 400', () => {
    it('offset "-1" → @Min(0) falha', async () => {
      const result = await safeTransform({ offset: '-1' });
      expect(result.ok).toBe(false);
      expect((result as any).error).toBeInstanceOf(BadRequestException);
    });

    it('offset "abc" → @IsInt falha', async () => {
      const result = await safeTransform({ offset: 'abc' });
      expect(result.ok).toBe(false);
      expect((result as any).error).toBeInstanceOf(BadRequestException);
    });
  });

  describe('valores ausentes', () => {
    it('sem parâmetros → dto válido com undefined', async () => {
      const result = await safeTransform({});
      expect(result.ok).toBe(true);
      expect((result as any).data).toBeDefined();
    });
  });
});
