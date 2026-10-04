import { Pool } from 'pg';
import { Decision, KybCase } from './types';

export interface CaseRepo {
  save(c: KybCase): Promise<void>;
  get(id: string): Promise<KybCase | null>;
  findByIdempotencyKey(key: string): Promise<KybCase | null>;
  list(filter: { decision?: Decision; limit: number }): Promise<KybCase[]>;
}

export class InMemoryRepo implements CaseRepo {
  private cases = new Map<string, KybCase>();
  async save(c: KybCase) { this.cases.set(c.id, c); }
  async get(id: string) { return this.cases.get(id) ?? null; }
  async findByIdempotencyKey(key: string) {
    return [...this.cases.values()].find(c => c.idempotencyKey === key) ?? null;
  }
  async list({ decision, limit }: { decision?: Decision; limit: number }) {
    return [...this.cases.values()]
      .filter(c => !decision || c.decision === decision)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
}

const fromRow = (r: any): KybCase => ({
  id: r.id, input: r.input, results: r.results, riskScore: r.risk_score,
  decision: r.decision, idempotencyKey: r.idempotency_key ?? undefined,
  createdAt: new Date(r.created_at).toISOString(),
});

export class PgRepo implements CaseRepo {
  constructor(private pool: Pool) {}
  async save(c: KybCase) {
    await this.pool.query(
      `INSERT INTO kyb_cases (id, input, results, risk_score, decision, idempotency_key, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [c.id, JSON.stringify(c.input), JSON.stringify(c.results), c.riskScore, c.decision, c.idempotencyKey ?? null, c.createdAt],
    );
  }
  async get(id: string) {
    const { rows } = await this.pool.query('SELECT * FROM kyb_cases WHERE id::text = $1', [id]);
    return rows[0] ? fromRow(rows[0]) : null;
  }
  async findByIdempotencyKey(key: string) {
    const { rows } = await this.pool.query('SELECT * FROM kyb_cases WHERE idempotency_key = $1', [key]);
    return rows[0] ? fromRow(rows[0]) : null;
  }
  async list({ decision, limit }: { decision?: Decision; limit: number }) {
    const { rows } = await this.pool.query(
      `SELECT * FROM kyb_cases WHERE ($1::text IS NULL OR decision = $1)
       ORDER BY created_at DESC LIMIT $2`, [decision ?? null, limit]);
    return rows.map(fromRow);
  }
}
