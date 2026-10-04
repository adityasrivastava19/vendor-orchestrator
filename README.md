# Vendor Orchestrator

A KYB (know-your-business) check orchestration API. One request fans out to several third-party compliance vendors in parallel, maps each vendor's different response format into a common schema, computes a risk score and decision (`approve` / `review` / `reject`), and stores the case in PostgreSQL.

The vendors here are **mocks** that simulate real-world behavior (different payload shapes, transient failures, outages, slow responses). The orchestration layer is what the project is about.

## Architecture

```
POST /v1/checks ──> validate (Zod) ──> idempotency check ──> orchestrator
                                                              │  (parallel fan-out)
                         ┌──────────────┬─────────────────────┤
                    sanctions        registry           adverse media
                         └── per-vendor timeout + retry w/ backoff ──┘
                                      │ normalize to common schema
                                      ▼
                          decide(): risk score + decision ──> PostgreSQL (JSONB)
```

Key design decisions:
- **Parallel fan-out:** latency is roughly the slowest vendor, not the sum.
- **Fault isolation:** each vendor call has a timeout and retries with exponential backoff. A vendor outage becomes an `error` result and routes the case to manual `review`; it never fails the whole request.
- **Vendor response mapping:** each vendor implements `call()` and `normalize()`, so adding a vendor means adding one file.
- **Idempotency:** a retried `POST` with the same `Idempotency-Key` returns the original case instead of re-running checks (enforced by a `UNIQUE` column).
- **Storage:** results kept as JSONB with an index on `(decision, created_at)` for the review queue.

## Run it

```bash
docker compose up --build        # API on :3000, PostgreSQL on the internal network
```

```bash
curl -X POST localhost:3000/v1/checks \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: demo-1' \
  -d '{"businessName":"Acme Corp","country":"US"}'

curl localhost:3000/v1/checks?decision=reject
```

Mock triggers (put in `businessName`): `sanctioned` (sanctions hit), `shell` (dissolved entity), `ghost` (not found), `fraud` (adverse media), `flaky` (fails once, then succeeds), `down` (vendor outage).

## Develop

```bash
npm install
npm test            # 13 tests: orchestration logic + HTTP API (in-memory repo)
npm run typecheck
```

CI (GitHub Actions) runs typecheck, tests, and a Docker build on every push.

## API

| Method | Path | Description |
|---|---|---|
| POST | `/v1/checks` | Run checks; supports `Idempotency-Key` header |
| GET | `/v1/checks/:id` | Fetch one case |
| GET | `/v1/checks?decision=&limit=` | List cases, filter by decision |
| GET | `/health` | Liveness |
