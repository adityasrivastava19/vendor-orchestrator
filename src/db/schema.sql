CREATE TABLE IF NOT EXISTS kyb_cases (
  id               UUID PRIMARY KEY,
  input            JSONB       NOT NULL,
  results          JSONB       NOT NULL,
  risk_score       INTEGER     NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  decision         TEXT        NOT NULL CHECK (decision IN ('approve','review','reject')),
  idempotency_key  TEXT UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kyb_cases_decision_created ON kyb_cases (decision, created_at DESC);
