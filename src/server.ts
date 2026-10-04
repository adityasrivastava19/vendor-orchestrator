import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createApp } from './app';
import { PgRepo } from './repo';
import { createAdverseMediaVendor, createRegistryVendor, createSanctionsVendor } from './vendors/mock';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8'));
  const app = createApp(new PgRepo(pool), [createSanctionsVendor(), createRegistryVendor(), createAdverseMediaVendor()]);
  const port = Number(process.env.PORT ?? 3000);
  const server = app.listen(port, () => console.log(JSON.stringify({ level: 'info', msg: `listening on ${port}` })));
  const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
main().catch(e => { console.error(e); process.exit(1); });
