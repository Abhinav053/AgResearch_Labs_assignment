import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { config } from '../config/env.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createPool(connectionString?: string) {
  const connStr =
    connectionString ||
    (process.env.NODE_ENV === 'test'
      ? config.TEST_DATABASE_URL || config.DATABASE_URL
      : config.DATABASE_URL);

  return new Pool({
    connectionString: connStr,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

export const pool = createPool();

export async function runMigrations(clientOrPool: pg.Pool | pg.PoolClient) {
  const sqlPath = path.join(__dirname, 'migrations', '001_initial.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await clientOrPool.query(sql);
}

export async function cleanTables(poolInstance: pg.Pool) {
  await poolInstance.query('TRUNCATE TABLE harvests, batches, trays CASCADE;');
}
