// tests/index.test.js
const request = require('supertest');
const app = require('../src/index');

describe('Hello World API', () => {
  it('should return Hello World on GET /', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toBe('Hello World!');
  });

  it('should return ok on GET /health', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});