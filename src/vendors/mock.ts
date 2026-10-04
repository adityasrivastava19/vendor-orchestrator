import { CheckInput, Vendor } from '../types';

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
  });

const has = (i: CheckInput, word: string) => i.businessName.toLowerCase().includes(word);

/** Each mock vendor returns a DIFFERENT raw shape, like real vendors do. */
export function createSanctionsVendor(latencyMs = 30): Vendor {
  return {
    name: 'mock-sanctions', check: 'sanctions',
    async call(input, signal) {
      await sleep(latencyMs, signal);
      return { hits: has(input, 'sanctioned') ? [{ list: 'OFAC-SDN', matchScore: 0.97 }] : [] };
    },
    normalize(raw) {
      const hits = (raw as { hits: { list: string; matchScore: number }[] }).hits;
      if (hits.length === 0) return { status: 'clear', riskScore: 0, details: { hits: 0 } };
      const top = Math.max(...hits.map(h => h.matchScore));
      return { status: top >= 0.9 ? 'fail' : 'review', riskScore: Math.round(top * 100), details: { hits } };
    },
  };
}

export function createRegistryVendor(latencyMs = 40): Vendor {
  return {
    name: 'mock-registry', check: 'registry',
    async call(input, signal) {
      await sleep(latencyMs, signal);
      if (has(input, 'ghost')) return { found: false };
      return { found: true, entity_status: has(input, 'shell') ? 'DISSOLVED' : 'ACTIVE' };
    },
    normalize(raw) {
      const r = raw as { found: boolean; entity_status?: string };
      if (!r.found) return { status: 'review', riskScore: 60, details: { found: false } };
      if (r.entity_status !== 'ACTIVE') return { status: 'fail', riskScore: 85, details: { entityStatus: r.entity_status } };
      return { status: 'clear', riskScore: 0, details: { entityStatus: 'ACTIVE' } };
    },
  };
}

/** Fails on its first call for names containing "flaky" so retries are exercised. */
export function createAdverseMediaVendor(latencyMs = 50): Vendor {
  const seen = new Map<string, number>();
  return {
    name: 'mock-adverse-media', check: 'adverse_media',
    async call(input, signal) {
      await sleep(latencyMs, signal);
      const n = (seen.get(input.businessName) ?? 0) + 1;
      seen.set(input.businessName, n);
      if (has(input, 'down')) throw new Error('503 upstream unavailable');
      if (has(input, 'flaky') && n === 1) throw new Error('503 transient');
      return { articleCount: has(input, 'fraud') ? 7 : 0, severity: has(input, 'fraud') ? 'HIGH' : 'NONE' };
    },
    normalize(raw) {
      const r = raw as { articleCount: number; severity: string };
      if (r.articleCount === 0) return { status: 'clear', riskScore: 0, details: { articles: 0 } };
      return { status: r.severity === 'HIGH' ? 'fail' : 'review', riskScore: r.severity === 'HIGH' ? 80 : 40, details: { articles: r.articleCount, severity: r.severity } };
    },
  };
}
