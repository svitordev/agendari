import {
  Controller,
  Get,
  Module,
  Post,
  Body,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import request from 'supertest';

/*
 * ============================================================
 * Controller de teste — recebe 2 requisições/minuto default
 * ============================================================
 */

@Controller('test')
class TestController {
  @Get()
  index() {
    return { status: 'ok' };
  }

  @Post('echo')
  echo(@Body() body: Record<string, unknown>) {
    return body;
  }
}

/*
 * ============================================================
 * Module de teste — ThrottlerModule com limites pequenos + APP_GUARD
 * ============================================================
 */

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: seconds(1), // 1 segundo TTL muito curto para teste rápido
        limit: 2, // 2 requisições por segundo
      },
    ]),
  ],
  controllers: [TestController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
class TestThrottlerModule {}

describe('ThrottlerGuard — HTTP 429', () => {
  let app: any;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestThrottlerModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    /*
     * Aguardar o TTL expirar (1s) para garantir que o contador
     * do throttler seja resetado entre os testes.
     */
    await new Promise((resolve) => setTimeout(resolve, 1100));
  });

  describe('GET /test', () => {
    it('1ª requisição deve retornar 200', async () => {
      const res = await request(app.getHttpServer()).get('/test').expect(200);
      expect(res.body.status).toBe('ok');
    });

    it('2ª requisição dentro do limite deve retornar 200', async () => {
      // 1ª
      await request(app.getHttpServer()).get('/test').expect(200);
      // 2ª
      const res = await request(app.getHttpServer()).get('/test').expect(200);
      expect(res.body.status).toBe('ok');
    });

    it('3ª requisição deve retornar 429 Too Many Requests', async () => {
      // 1ª e 2ª dentro do limite
      await request(app.getHttpServer()).get('/test').expect(200);
      await request(app.getHttpServer()).get('/test').expect(200);
      // 3ª excede o limite → 429
      const res = await request(app.getHttpServer())
        .get('/test')
        .expect(429);
      expect(res.body.message).toBeDefined();
    });
  });

  describe('POST /test/echo', () => {
    it('3 requisições no mesmo endpoint — 3ª retorna 429', async () => {
      await request(app.getHttpServer())
        .post('/test/echo')
        .send({ value: 'test' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/test/echo')
        .send({ value: 'test' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/test/echo')
        .send({ value: 'test' })
        .expect(429);
    });
  });
});
