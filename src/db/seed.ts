import { pool } from './pool.js';

async function seed() {
  console.log('\n🌱 Seeding database with sample aeroponic trays, batches, and harvests...');

  try {
    // 1. Clear existing data
    await pool.query('TRUNCATE TABLE harvests, batches, trays CASCADE;');

    // 2. Insert Trays
    const tray1 = await pool.query(
      `INSERT INTO trays (code, zone, capacity_units) VALUES ('TRAY-001', 'ZONE-A', 50) RETURNING id;`
    );
    const tray2 = await pool.query(
      `INSERT INTO trays (code, zone, capacity_units) VALUES ('TRAY-002', 'ZONE-A', 75) RETURNING id;`
    );
    const tray3 = await pool.query(
      `INSERT INTO trays (code, zone, capacity_units) VALUES ('TRAY-003', 'ZONE-B', 100) RETURNING id;`
    );
    await pool.query(
      `INSERT INTO trays (code, zone, capacity_units) VALUES ('TRAY-004', 'ZONE-B', 60) RETURNING id;`
    );

    const t1Id = tray1.rows[0].id;
    const t2Id = tray2.rows[0].id;
    const t3Id = tray3.rows[0].id;

    // 3. Insert Batches
    // Batch 1: GROWING in TRAY-001
    await pool.query(
      `INSERT INTO batches (tray_id, crop, seeded_on, stage, expected_harvest_on)
       VALUES ($1, 'Romaine Lettuce', '2026-03-01', 'GROWING', '2026-04-01');`,
      [t1Id]
    );

    // Batch 2: HARVEST_READY in TRAY-002
    await pool.query(
      `INSERT INTO batches (tray_id, crop, seeded_on, stage, expected_harvest_on)
       VALUES ($1, 'Spinach', '2026-02-15', 'HARVEST_READY', '2026-03-25');`,
      [t2Id]
    );

    // Batch 3: Historical HARVESTED batch in TRAY-003
    const batch3 = await pool.query(
      `INSERT INTO batches (tray_id, crop, seeded_on, stage, expected_harvest_on)
       VALUES ($1, 'Butterhead Lettuce', '2026-01-10', 'HARVESTED', '2026-02-15')
       RETURNING id;`,
      [t3Id]
    );
    const b3Id = batch3.rows[0].id;

    // Harvest for Batch 3
    await pool.query(
      `INSERT INTO harvests (batch_id, harvested_on, weight_grams, grade)
       VALUES ($1, '2026-02-15', 540.50, 'A');`,
      [b3Id]
    );

    // Batch 4: Reused TRAY-003 after harvest of Batch 3 (New active batch: SEEDED)
    await pool.query(
      `INSERT INTO batches (tray_id, crop, seeded_on, stage, expected_harvest_on)
       VALUES ($1, 'Tuscan Kale', '2026-03-10', 'SEEDED', '2026-04-15');`,
      [t3Id]
    );

    console.log('✅ Sample data seeded successfully!');
    console.log('Summary of seeded data:');
    console.log('  - 4 Trays created (TRAY-001, TRAY-002, TRAY-003, TRAY-004)');
    console.log('  - 4 Batches created (GROWING, HARVEST_READY, HARVESTED, SEEDED)');
    console.log('  - 1 Harvest record created (540.50g, Grade A)');
    console.log('  - Demonstrated tray reuse on TRAY-003!');
  } catch (err: any) {
    console.error('❌ Seeding failed:', err.message);
  } finally {
    await pool.end();
  }
}

seed();
