import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { UpdateProfessionalProfileDto } from './update-professional-profile.dto';
import { ThemeColorsDto } from './theme-colors.dto';

describe('UpdateProfessionalProfileDto — themeColors (correção final)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  async function transformDto(body: unknown) {
    try {
      const result = await pipe.transform(body, {
        type: 'body',
        metatype: UpdateProfessionalProfileDto,
        data: '',
      } as any);
      const value = result?.value ?? result;
      return {
        success: true,
        value,
        themeColors: value?.themeColors,
        tcConstructor: value?.themeColors?.constructor?.name ?? 'null/undefined',
        tcIsInstance: value?.themeColors instanceof ThemeColorsDto,
        tcKeys: value?.themeColors && typeof value?.themeColors === 'object' && !Array.isArray(value.themeColors) ? Object.keys(value.themeColors) : null,
      };
    } catch (e: unknown) {
      const err = e as { response?: Record<string, unknown> };
      return {
        success: false,
        error: (err?.response as Record<string, unknown>) ?? null,
        themeColors: null,
        tcConstructor: null,
        tcIsInstance: false,
        tcKeys: null,
      };
    }
  }

  describe('Casos válidos', () => {
    it('themeColors: ausente → undefined', async () => {
      const result = await transformDto({ name: 'Test' });
      expect(result.success).toBe(true);
      expect(result.themeColors).toBeUndefined();
    });

    it('themeColors: {} → válido (todos @IsOptional)', async () => {
      const result = await transformDto({ themeColors: {} });
      expect(result.success).toBe(true);
      expect(result.themeColors).toBeDefined();
      expect(result.tcIsInstance).toBe(true);
      expect(result.tcKeys).toEqual([]);
    });

    it('themeColors: { primary: "#fff" } → válido', async () => {
      const result = await transformDto({ themeColors: { primary: '#fff' } });
      expect(result.success).toBe(true);
      expect((result.themeColors as ThemeColorsDto).primary).toBe('#fff');
      expect(result.tcIsInstance).toBe(true);
    });

    it('themeColors: { primary, secondary, accent } → válido', async () => {
      const result = await transformDto({
        themeColors: { primary: '#fff', secondary: '#000', accent: '#f00' },
      });
      expect(result.success).toBe(true);
      const tc = result.themeColors as ThemeColorsDto;
      expect(tc.primary).toBe('#fff');
      expect(tc.secondary).toBe('#000');
      expect(tc.accent).toBe('#f00');
      expect(result.tcIsInstance).toBe(true);
    });

    it('themeColors: null → null (não atualizar)', async () => {
      const result = await transformDto({ themeColors: null });
      expect(result.success).toBe(true);
      expect(result.themeColors).toBeNull();
    });
  });

  describe('Casos inválidos', () => {
    it('themeColors: { primary: 123 } → 400 (IsString falha em number)', async () => {
      const result = await transformDto({ themeColors: { primary: 123 } });
      expect(result.success).toBe(false);
      expect(result.error?.message).toBeDefined();
    });

    it('themeColors: "texto" → 400 (IsObject falha)', async () => {
      const result = await transformDto({ themeColors: 'texto' });
      expect(result.success).toBe(false);
      expect(result.error?.message).toBeDefined();
    });

    it('themeColors: [] → 400 (IsObject falha em array)', async () => {
      const result = await transformDto({ themeColors: [1, 2, 3] });
      expect(result.success).toBe(false);
      expect(result.error?.message).toBeDefined();
    });

    it('themeColors: { primary: "#fff", campoExtra: "x" } → 400 (forbidNonWhitelisted)', async () => {
      const result = await transformDto({ themeColors: { primary: '#fff', campoExtra: 'x' } });
      expect(result.success).toBe(false);
      expect(result.error?.message).toBeDefined();
    });
  });
});
