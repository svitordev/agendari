import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

const mockAuthService = {
  login: jest.fn().mockResolvedValue({ accessToken: 'token', user: { id: '1', email: 'test@example.com' } }),
  register: jest.fn().mockResolvedValue({ accessToken: 'token', user: { id: '1', email: 'test@example.com' } }),
  validateUser: jest.fn().mockResolvedValue({ id: '1', email: 'test@example.com' }),
};

describe('AuthController — route registration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('→ 404 Not Found', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: '12345678',
          firstName: 'Test',
          lastName: 'User',
        });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /auth/login', () => {
    it('→ 201 (mocked)', async () => {
      const dto: LoginDto = { email: 'test@example.com', password: '12345678' };
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send(dto);
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
    });
  });
});
