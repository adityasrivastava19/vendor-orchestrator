import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { InMemoryRepo } from '../src/repo';
import { createAdverseMediaVendor, createRegistryVendor, createSanctionsVendor } from '../src/vendors/mock';

const makeApp = () => createApp(new InMemoryRepo(),
  [createSanctionsVendor(1), createRegistryVendor(1), createAdverseMediaVendor(1)],
  { timeoutMs: 200, maxAttempts: 2, backoffMs: 1 });

describe('API', () => {
  it('POST /v1/checks creates a case and GET returns it', async () => {
    const app = makeApp();
    const created = await request(app).post('/v1/checks').send({ businessName: 'Acme', country: 'us' });
    expect(created.status).toBe(201);
    expect(created.body.decision).toBe('approve');
    expect(created.body.input.country).toBe('US');
    const fetched = await request(app).get(`/v1/checks/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(created.body.id);
  });

  it('validates input', async () => {
    const res = await request(makeApp()).post('/v1/checks').send({ businessName: '', country: 'USA' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('is idempotent for a repeated Idempotency-Key', async () => {
    const app = makeApp();
    const body = { businessName: 'Acme', country: 'US' };
    const a = await request(app).post('/v1/checks').set('Idempotency-Key', 'k1').send(body);
    const b = await request(app).post('/v1/checks').set('Idempotency-Key', 'k1').send(body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
  });

  it('lists cases filtered by decision', async () => {
    const app = makeApp();
    await request(app).post('/v1/checks').send({ businessName: 'Acme', country: 'US' });
    await request(app).post('/v1/checks').send({ businessName: 'Sanctioned Co', country: 'US' });
    const res = await request(app).get('/v1/checks?decision=reject');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].decision).toBe('reject');
  });

  it('404s on unknown case', async () => {
    expect((await request(makeApp()).get('/v1/checks/does-not-exist')).status).toBe(404);
  });
});
