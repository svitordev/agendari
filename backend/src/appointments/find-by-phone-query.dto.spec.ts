import { ValidationPipe } from '@nestjs/common';
import { FindByPhoneQueryDto } from './dto/find-by-phone-query.dto';

function createValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
}

describe('FindByPhoneQueryDto — ValidationPipe REAL', () => {
  const pipe = createValidationPipe();

  async function transformWithMetatype(input: Record<string, unknown>) {
    return pipe.transform(input, {
      type: 'query',
      metatype: FindByPhoneQueryDto,
      data: '',
    } as any);
  }

  describe('validação com metatype', () => {
    it('{} → OK', async () => {
      const result = await transformWithMetatype({});
      expect(result).toEqual({});
    });

    it('{ limit: "1" } → { limit: 1 }', async () => {
      const result = await transformWithMetatype({ limit: '1' });
      expect(result).toEqual({ limit: 1 });
      expect(typeof result.limit).toBe('number');
      expect(result.limit.constructor.name).toBe('Number');
    });

    it('{ limit: "50" } → { limit: 50 }', async () => {
      const result = await transformWithMetatype({ limit: '50' });
      expect(result).toEqual({ limit: 50 });
      expect(typeof result.limit).toBe('number');
    });

    it('{ limit: "100" } → { limit: 100 }', async () => {
      const result = await transformWithMetatype({ limit: '100' });
      expect(result).toEqual({ limit: 100 });
    });

    it('{ limit: "101" } → 400', async () => {
      await expect(transformWithMetatype({ limit: '101' })).rejects.toThrow();
    });

    it('{ limit: "0" } → 400', async () => {
      await expect(transformWithMetatype({ limit: '0' })).rejects.toThrow();
    });

    it('{ limit: "-1" } → 400', async () => {
      await expect(transformWithMetatype({ limit: '-1' })).rejects.toThrow();
    });

    it('{ limit: "abc" } → 400', async () => {
      await expect(transformWithMetatype({ limit: 'abc' })).rejects.toThrow();
    });

    it('{ limit: "10abc" } → 400', async () => {
      await expect(transformWithMetatype({ limit: '10abc' })).rejects.toThrow();
    });

    it('{ limit: "1.5" } → 400', async () => {
      await expect(transformWithMetatype({ limit: '1.5' })).rejects.toThrow();
    });

    it('{ limit: "50.9" } → 400', async () => {
      await expect(transformWithMetatype({ limit: '50.9' })).rejects.toThrow();
    });

    it('{ offset: "0" } → { offset: 0 }', async () => {
      const result = await transformWithMetatype({ offset: '0' });
      expect(result).toEqual({ offset: 0 });
      expect(typeof result.offset).toBe('number');
    });

    it('{ offset: "20" } → { offset: 20 }', async () => {
      const result = await transformWithMetatype({ offset: '20' });
      expect(result).toEqual({ offset: 20 });
    });

    it('{ offset: "-1" } → 400', async () => {
      await expect(transformWithMetatype({ offset: '-1' })).rejects.toThrow();
    });

    it('{ offset: "abc" } → 400', async () => {
      await expect(transformWithMetatype({ offset: 'abc' })).rejects.toThrow();
    });

    it('{ offset: "20abc" } → 400', async () => {
      await expect(transformWithMetatype({ offset: '20abc' })).rejects.toThrow();
    });

    it('{ offset: "1.5" } → 400', async () => {
      await expect(transformWithMetatype({ offset: '1.5' })).rejects.toThrow();
    });

    it('{ campoExtra: "x" } → 400', async () => {
      await expect(transformWithMetatype({ campoExtra: 'x' })).rejects.toThrow();
    });

    it('{ professionalId: "abc" } → OK', async () => {
      const result = await transformWithMetatype({ professionalId: 'abc' });
      expect(result.professionalId).toBe('abc');
    });

    it('{ professionalId: "abc", limit: "50", offset: "20" } → OK', async () => {
      const result = await transformWithMetatype({ professionalId: 'abc', limit: '50', offset: '20' });
      expect(result.professionalId).toBe('abc');
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(20);
      expect(typeof result.limit).toBe('number');
      expect(typeof result.offset).toBe('number');
    });

    // Query completa equivalente a ?phone=81999999999&professionalId=abc&limit=50&offset=20
    it('{ phone: "81999999999", professionalId: "abc", limit: "50", offset: "20" } → OK', async () => {
      const result = await transformWithMetatype({ phone: '81999999999', professionalId: 'abc', limit: '50', offset: '20' });
      expect(result.phone).toBe('81999999999');
      expect(result.professionalId).toBe('abc');
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(20);
      expect(typeof result.limit).toBe('number');
      expect(typeof result.offset).toBe('number');
    });

    // phone não gera erro de whitelist
    it('{ phone: "81999999999" } → OK', async () => {
      const result = await transformWithMetatype({ phone: '81999999999' });
      expect(result.phone).toBe('81999999999');
    });

    // campoExtra com phone → 400
    it('{ phone: "81999999999", campoExtra: "x" } → 400', async () => {
      await expect(transformWithMetatype({ phone: '81999999999', campoExtra: 'x' })).rejects.toThrow();
    });
  });
});
