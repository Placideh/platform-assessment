import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { register } from 'prom-client';

describe('Application Endpoints (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    register.clear();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / should return platform engineer greeting', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ message: 'Hello from Platform Engineer!' });
  });

  it('GET /health should return ok status', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /metrics should return prometheus metrics', () => {
    return request(app.getHttpServer())
      .get('/metrics')
      .expect(200)
      .expect((res) => {
        expect(res.text).toContain('http_requests_total');
        expect(res.text).toContain('http_request_duration_seconds');
      });
  });
});
