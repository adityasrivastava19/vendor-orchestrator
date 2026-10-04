import { randomUUID } from 'crypto';
import { CheckInput, Decision, KybCase, NormalizedResult, Vendor } from './types';

export interface OrchestratorOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: number;
}

/** Run one vendor with a per-attempt timeout and retries; never throws. */
export async function runVendor(
  vendor: Vendor, input: CheckInput, opts: Required<OrchestratorOptions>,
): Promise<NormalizedResult> {
  const started = Date.now();
  let lastError = 'unknown';
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const raw = await vendor.call(input, controller.signal);
      const mapped = vendor.normalize(raw);
      return { vendor: vendor.name, check: vendor.check, ...mapped, attempts: attempt, latencyMs: Date.now() - started };
    } catch (err) {
      lastError = (err as Error).message;
      if (attempt < opts.maxAttempts) await new Promise(r => setTimeout(r, opts.backoffMs * 2 ** (attempt - 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  // A vendor outage must not crash the case: record it and force manual review.
  return {
    vendor: vendor.name, check: vendor.check, status: 'error', riskScore: 50,
    details: {}, attempts: opts.maxAttempts, latencyMs: Date.now() - started, error: lastError,
  };
}

/** Combine vendor results: any fail => reject; any review/error => manual review. */
export function decide(results: NormalizedResult[]): { riskScore: number; decision: Decision } {
  const riskScore = results.length ? Math.max(...results.map(r => r.riskScore)) : 0;
  if (results.some(r => r.status === 'fail')) return { riskScore, decision: 'reject' };
  if (results.some(r => r.status === 'review' || r.status === 'error')) return { riskScore, decision: 'review' };
  return { riskScore, decision: 'approve' };
}

export async function orchestrate(
  vendors: Vendor[], input: CheckInput, options: OrchestratorOptions = {},
): Promise<KybCase> {
  const opts = { timeoutMs: 2000, maxAttempts: 2, backoffMs: 50, ...options };
  // Fan out in parallel: total latency ~ slowest vendor, not the sum.
  const results = await Promise.all(vendors.map(v => runVendor(v, input, opts)));
  return { id: randomUUID(), input, results, ...decide(results), createdAt: new Date().toISOString() };
}
