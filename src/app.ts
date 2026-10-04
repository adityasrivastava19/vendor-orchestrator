import express from 'express';
import { z } from 'zod';
import { orchestrate, OrchestratorOptions } from './orchestrator';
import { CaseRepo } from './repo';
import { Vendor } from './types';

const checkSchema = z.object({
  businessName: z.string().trim().min(1).max(200),
  country: z.string().length(2).transform(s => s.toUpperCase()),
  registrationNumber: z.string().trim().max(64).optional(),
});

const listSchema = z.object({
  decision: z.enum(['approve', 'review', 'reject']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function createApp(repo: CaseRepo, vendors: Vendor[], options?: OrchestratorOptions) {
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.post('/v1/checks', async (req, res, next) => {
    try {
      const parsed = checkSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });

      // Idempotency: a retried POST with the same key returns the original case.
      const key = req.header('Idempotency-Key');
      if (key) {
        const existing = await repo.findByIdempotencyKey(key);
        if (existing) return res.status(200).json(existing);
      }

      const kybCase = await orchestrate(vendors, parsed.data, options);
      if (key) kybCase.idempotencyKey = key;
      await repo.save(kybCase);
      res.status(201).json(kybCase);
    } catch (err) { next(err); }
  });

  app.get('/v1/checks/:id', async (req, res, next) => {
    try {
      const c = await repo.get(req.params.id);
      if (!c) return res.status(404).json({ error: 'not_found' });
      res.json(c);
    } catch (err) { next(err); }
  });

  app.get('/v1/checks', async (req, res, next) => {
    try {
      const q = listSchema.safeParse(req.query);
      if (!q.success) return res.status(400).json({ error: 'invalid_request', issues: q.error.issues });
      res.json(await repo.list(q.data));
    } catch (err) { next(err); }
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(JSON.stringify({ level: 'error', msg: err.message }));
    res.status(500).json({ error: 'internal_error' });
  });
  return app;
}
