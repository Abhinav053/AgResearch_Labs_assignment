import { pool } from './pool.js';

async function inspect() {
  console.log('\n--- PostgreSQL Tables in Database: arl_aeroponics ---');
  const res = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
  );
  
  for (const row of res.rows) {
    console.log(`\nTable: ${row.table_name}`);
    const cols = await pool.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1;`,
      [row.table_name]
    );
    console.table(cols.rows);
  }

  const indexes = await pool.query(
    "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public';"
  );
  console.log('\n--- Partial & Unique Indexes ---');
  console.table(indexes.rows);

  await pool.end();
}

inspect();
