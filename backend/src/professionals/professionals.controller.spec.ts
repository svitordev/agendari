import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ProfessionalsController } from './professionals.controller';
import { ProfessionalsService } from './professionals.service';

describe('ProfessionalsController — HTTP real', () => {
  let app: INestApplication;
  let service: jest.MockedObject<any>;

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      findOneById: jest.fn(),
      findOneBySlug: jest.fn(),
      updateProfile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfessionalsController],
      providers: [
        {
          provide: ProfessionalsService,
          useValue: service,
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /professionals → 404', () => {
    it('POST /professionals retorna 404', async () => {
      await request(app.getHttpServer())
        .post('/professionals')
        .send({
          name: 'Test',
          slug: 'test',
        })
        .expect(404);
    });
  });

  describe('rotas existentes', () => {
    it('GET /professionals → 200', async () => {
      service.findAll.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/professionals')
        .expect(200);

      expect(service.findAll).toHaveBeenCalled();
    });

    it('GET /professionals/slug/:slug → 200', async () => {
      service.findOneBySlug.mockResolvedValue({ id: '1', slug: 'jessicasantana' });

      await request(app.getHttpServer())
        .get('/professionals/slug/jessicasantana')
        .expect(200);

      expect(service.findOneBySlug).toHaveBeenCalledWith('jessicasantana');
    });
  });
});
