import { describe, expect, it } from 'vitest';
import { decide, orchestrate } from '../src/orchestrator';
import { createAdverseMediaVendor, createRegistryVendor, createSanctionsVendor } from '../src/vendors/mock';

const vendors = () => [createSanctionsVendor(1), createRegistryVendor(1), createAdverseMediaVendor(1)];
const fast = { timeoutMs: 200, maxAttempts: 2, backoffMs: 1 };
const input = (businessName: string) => ({ businessName, country: 'US' });

describe('orchestrate', () => {
  it('approves a clean business', async () => {
    const c = await orchestrate(vendors(), input('Acme Corp'), fast);
    expect(c.decision).toBe('approve');
    expect(c.riskScore).toBe(0);
    expect(c.results).toHaveLength(3);
  });

  it('rejects on a strong sanctions hit', async () => {
    const c = await orchestrate(vendors(), input('Sanctioned Holdings'), fast);
    expect(c.decision).toBe('reject');
    expect(c.riskScore).toBe(97);
  });

  it('rejects a dissolved entity and sends unknown entities to review', async () => {
    expect((await orchestrate(vendors(), input('Shell Co'), fast)).decision).toBe('reject');
    expect((await orchestrate(vendors(), input('Ghost Ltd'), fast)).decision).toBe('review');
  });

  it('retries a transient vendor failure and still succeeds', async () => {
    const c = await orchestrate(vendors(), input('Flaky Inc'), fast);
    const media = c.results.find(r => r.check === 'adverse_media')!;
    expect(media.attempts).toBe(2);
    expect(media.status).toBe('clear');
    expect(c.decision).toBe('approve');
  });

  it('records a hard vendor outage as an error and routes to manual review', async () => {
    const c = await orchestrate(vendors(), input('Down LLC'), fast);
    const media = c.results.find(r => r.check === 'adverse_media')!;
    expect(media.status).toBe('error');
    expect(media.error).toMatch(/503/);
    expect(c.decision).toBe('review');
  });

  it('times out a slow vendor instead of hanging', async () => {
    const c = await orchestrate([createSanctionsVendor(500)], input('Acme'), { timeoutMs: 20, maxAttempts: 1, backoffMs: 1 });
    expect(c.results[0].status).toBe('error');
  });

  it('runs vendors in parallel (latency ~ slowest, not sum)', async () => {
    const t = Date.now();
    await orchestrate([createSanctionsVendor(80), createRegistryVendor(80), createAdverseMediaVendor(80)], input('Acme'), fast);
    expect(Date.now() - t).toBeLessThan(200);
  });
});

describe('decide', () => {
  it('approves with no results', () => expect(decide([]).decision).toBe('approve'));
});
