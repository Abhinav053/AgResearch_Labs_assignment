import pg from 'pg';
import { createPool, runMigrations } from './pool.js';
import { config } from '../config/env.js';

const { Client } = pg;

export async function ensureDatabaseExists(dbUrl: string) {
  try {
    const url = new URL(dbUrl);
    const dbName = url.pathname.slice(1);
    
    // Connect to default 'postgres' database to create target database if missing
    url.pathname = '/postgres';
    const client = new Client({ connectionString: url.toString() });

    await client.connect();
    const res = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1;`,
      [dbName]
    );

    if (res.rows.length === 0) {
      console.log(`Database '${dbName}' does not exist. Creating it now...`);
      await client.query(`CREATE DATABASE "${dbName}";`);
      console.log(`Database '${dbName}' created successfully.`);
    }
    await client.end();
  } catch (err: any) {
    console.error('Error checking/creating database:', err.message);
  }
}

async function migrate() {
  if (config.DATABASE_URL) {
    await ensureDatabaseExists(config.DATABASE_URL);
  }
  if (config.TEST_DATABASE_URL) {
    await ensureDatabaseExists(config.TEST_DATABASE_URL);
  }

  const pool = createPool();
  console.log('Connecting to PostgreSQL target database...');
  try {
    const client = await pool.connect();
    console.log('Successfully connected to PostgreSQL database.');
    await runMigrations(client);
    console.log('🎉 Migrations executed successfully! All tables created.');
    client.release();
    await pool.end();
  } catch (err: any) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
}
