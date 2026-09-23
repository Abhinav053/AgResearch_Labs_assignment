import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { config } from '../src/config/env.js';
import { ensureDatabaseExists } from '../src/db/migrate.js';
import { pool, runMigrations } from '../src/db/pool.js';
import { PgBatchRepository } from '../src/repositories/pg-batch.repository.js';
import { PgHarvestRepository } from '../src/repositories/pg-harvest.repository.js';
import { PgTrayRepository } from '../src/repositories/pg-tray.repository.js';

describe('PostgreSQL Database & API Integration Edge Cases', () => {
  let app: ReturnType<typeof buildApp>;
  let trayRepo: PgTrayRepository;
  let batchRepo: PgBatchRepository;
  let harvestRepo: PgHarvestRepository;

  beforeAll(async () => {
    // Auto-create test database if needed and run migrations
    const connStr = config.TEST_DATABASE_URL || config.DATABASE_URL;
    if (connStr) {
      await ensureDatabaseExists(connStr);
    }

    const client = await pool.connect();
    await runMigrations(client);
    client.release();
  });

  beforeEach(async () => {
    // Truncate tables for a clean slate per test
    await pool.query('TRUNCATE TABLE harvests, batches, trays CASCADE;');

    trayRepo = new PgTrayRepository(pool);
    batchRepo = new PgBatchRepository(pool);
    harvestRepo = new PgHarvestRepository(pool);
    app = buildApp({ trayRepo, batchRepo, harvestRepo });
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('Tray Domain Edge Cases (PostgreSQL)', () => {
    it('should create tray and enforce case-insensitive UNIQUE code in Postgres', async () => {
      const res1 = await app.inject({
        method: 'POST',
        url: '/trays',
        payload: { code: 'TRAY-PG-01', zone: 'ZONE-A', capacity_units: 50 },
      });
      expect(res1.statusCode).toBe(201);

      // Attempt duplicate code with different casing (tray-pg-01)
      const res2 = await app.inject({
        method: 'POST',
        url: '/trays',
        payload: { code: 'tray-pg-01', zone: 'ZONE-B', capacity_units: 60 },
      });
      expect(res2.statusCode).toBe(409);
      expect(res2.json().error.code).toBe('TRAY_CODE_EXISTS');
    });

    it('should reject non-positive capacity_units (CHECK capacity_units > 0)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/trays',
        payload: { code: 'TRAY-INVALID', zone: 'ZONE-A', capacity_units: 0 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 for non-existent UUID and 400 for invalid UUID format', async () => {
      const nonExistentUuid = '00000000-0000-4000-8000-000000000000';
      const res404 = await app.inject({
        method: 'GET',
        url: `/trays/${nonExistentUuid}`,
      });
      expect(res404.statusCode).toBe(404);

      const res400 = await app.inject({
        method: 'GET',
        url: '/trays/not-a-valid-uuid',
      });
      expect(res400.statusCode).toBe(400);
    });
  });

  describe('Batch Active Constraints & Partial Index (PostgreSQL)', () => {
    it('should enforce partial unique index: 1 active batch per tray in Postgres', async () => {
      const trayRes = await app.inject({
        method: 'POST',
        url: '/trays',
        payload: { code: 'ACTIVE-TRAY-01', zone: 'ZONE-A', capacity_units: 100 },
      });
      const trayId = trayRes.json().id;

      // First active batch
      const b1 = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Romaine Lettuce',
          seeded_on: '2026-03-01',
          expected_harvest_on: '2026-04-01',
        },
      });
      expect(b1.statusCode).toBe(201);

      // Second active batch (must be rejected by PostgreSQL partial unique index)
      const b2 = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Butterhead Lettuce',
          seeded_on: '2026-03-02',
          expected_harvest_on: '2026-04-02',
        },
      });
      expect(b2.statusCode).toBe(409);
      expect(b2.json().error.code).toBe('TRAY_ALREADY_HAS_ACTIVE_BATCH');
    });

    it('should allow tray reuse after previous batch is HARVESTED', async () => {
      const trayRes = await app.inject({
        method: 'POST',
        url: '/trays',
        payload: { code: 'REUSE-TRAY-01', zone: 'ZONE-A', capacity_units: 100 },
      });
      const trayId = trayRes.json().id;

      // Seed 1st batch
      const b1Res = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Spinach',
          seeded_on: '2026-01-01',
          expected_harvest_on: '2026-02-01',
        },
      });
      const b1Id = b1Res.json().id;

      // Transition to HARVEST_READY & Harvest it
      await app.inject({
        method: 'PATCH',
        url: `/batches/${b1Id}/stage`,
        payload: { target_stage: 'GERMINATION' },
      });
      await app.inject({
        method: 'PATCH',
        url: `/batches/${b1Id}/stage`,
        payload: { target_stage: 'GROWING' },
      });
      await app.inject({
        method: 'PATCH',
        url: `/batches/${b1Id}/stage`,
        payload: { target_stage: 'HARVEST_READY' },
      });
      await app.inject({
        method: 'POST',
        url: `/batches/${b1Id}/harvest`,
        payload: { harvested_on: '2026-02-01', weight_grams: 500, grade: 'A' },
      });

      // Seed 2nd batch in SAME tray (Tray Reuse)
      const b2Res = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Kale',
          seeded_on: '2026-02-05',
          expected_harvest_on: '2026-03-05',
        },
      });
      expect(b2Res.statusCode).toBe(201);
      expect(b2Res.json().crop).toBe('Kale');
    });
  });

  describe('Stage Transitions Edge Cases (PostgreSQL)', () => {
    it('should reject skipping stages and moving backward', async () => {
      const trayRes = await app.inject({
        method: 'POST',
        url: '/trays',
        payload: { code: 'STAGE-PG-TRAY', zone: 'ZONE-A', capacity_units: 50 },
      });
      const trayId = trayRes.json().id;

      const batchRes = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Arugula',
          seeded_on: '2026-03-01',
          expected_harvest_on: '2026-04-01',
        },
      });
      const batchId = batchRes.json().id;

      // Reject skipping SEEDED -> GROWING
      const skipRes = await app.inject({
        method: 'PATCH',
        url: `/batches/${batchId}/stage`,
        payload: { target_stage: 'GROWING' },
      });
      expect(skipRes.statusCode).toBe(409);
      expect(skipRes.json().error.code).toBe('INVALID_STAGE_TRANSITION');

      // Valid step: SEEDED -> GERMINATION
      await app.inject({
        method: 'PATCH',
        url: `/batches/${batchId}/stage`,
        payload: { target_stage: 'GERMINATION' },
      });

      // Reject backward: GERMINATION -> SEEDED
      const backRes = await app.inject({
        method: 'PATCH',
        url: `/batches/${batchId}/stage`,
        payload: { target_stage: 'SEEDED' },
      });
      expect(backRes.statusCode).toBe(409);
      expect(backRes.json().error.code).toBe('INVALID_STAGE_TRANSITION');
    });
  });

  describe('Harvest Atomic Transaction & Invariants (PostgreSQL)', () => {
    it('should atomically record harvest and set stage to HARVESTED in a DB Transaction', async () => {
      const trayRes = await app.inject({
        method: 'POST',
        url: '/trays',
        payload: { code: 'TX-HARVEST-TRAY', zone: 'ZONE-A', capacity_units: 50 },
      });
      const trayId = trayRes.json().id;

      const batchRes = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Basil',
          seeded_on: '2026-03-01',
          expected_harvest_on: '2026-04-01',
        },
      });
      const batchId = batchRes.json().id;

      // Advance to HARVEST_READY
      await app.inject({
        method: 'PATCH',
        url: `/batches/${batchId}/stage`,
        payload: { target_stage: 'GERMINATION' },
      });
      await app.inject({
        method: 'PATCH',
        url: `/batches/${batchId}/stage`,
        payload: { target_stage: 'GROWING' },
      });
      await app.inject({
        method: 'PATCH',
        url: `/batches/${batchId}/stage`,
        payload: { target_stage: 'HARVEST_READY' },
      });

      // Record harvest
      const harvestRes = await app.inject({
        method: 'POST',
        url: `/batches/${batchId}/harvest`,
        payload: { harvested_on: '2026-04-01', weight_grams: 350.75, grade: 'A' },
      });
      expect(harvestRes.statusCode).toBe(201);
      expect(harvestRes.json().weight_grams).toBe(350.75);

      // Verify batch stage updated atomically to HARVESTED
      const bRes = await app.inject({
        method: 'GET',
        url: `/batches/${batchId}`,
      });
      expect(bRes.json().stage).toBe('HARVESTED');
    });

    it('should reject duplicate harvest attempts (UNIQUE batch_id constraint in Postgres)', async () => {
      const trayRes = await app.inject({
        method: 'POST',
        url: '/trays',
        payload: { code: 'DUP-HARVEST-TRAY', zone: 'ZONE-A', capacity_units: 50 },
      });
      const trayId = trayRes.json().id;

      const batchRes = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Mint',
          seeded_on: '2026-03-01',
          expected_harvest_on: '2026-04-01',
        },
      });
      const batchId = batchRes.json().id;

      // Advance to HARVEST_READY & harvest
      await app.inject({
        method: 'PATCH',
        url: `/batches/${batchId}/stage`,
        payload: { target_stage: 'GERMINATION' },
      });
      await app.inject({
        method: 'PATCH',
        url: `/batches/${batchId}/stage`,
        payload: { target_stage: 'GROWING' },
      });
      await app.inject({
        method: 'PATCH',
        url: `/batches/${batchId}/stage`,
        payload: { target_stage: 'HARVEST_READY' },
      });
      await app.inject({
        method: 'POST',
        url: `/batches/${batchId}/harvest`,
        payload: { harvested_on: '2026-04-01', weight_grams: 200, grade: 'B' },
      });

      // Second harvest attempt
      const dupRes = await app.inject({
        method: 'POST',
        url: `/batches/${batchId}/harvest`,
        payload: { harvested_on: '2026-04-02', weight_grams: 100, grade: 'C' },
      });
      expect(dupRes.statusCode).toBe(409);
    });
  });

  describe('PostgreSQL Filtering, JOIN & Pagination', () => {
    it('should perform SQL JOIN between batches and trays for zone filtering and pagination', async () => {
      const t1 = await app.inject({
        method: 'POST',
        url: '/trays',
        payload: { code: 'JOIN-T1', zone: 'ZONE-ALPHA', capacity_units: 50 },
      });
      const t2 = await app.inject({
        method: 'POST',
        url: '/trays',
        payload: { code: 'JOIN-T2', zone: 'ZONE-BETA', capacity_units: 50 },
      });

      await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: t1.json().id,
          crop: 'Hydroponic Lettuce',
          seeded_on: '2026-03-01',
          expected_harvest_on: '2026-04-01',
        },
      });

      await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: t2.json().id,
          crop: 'Chard',
          seeded_on: '2026-03-01',
          expected_harvest_on: '2026-04-01',
        },
      });

      // Filter by zone=ZONE-ALPHA
      const zoneRes = await app.inject({
        method: 'GET',
        url: '/batches?zone=ZONE-ALPHA',
      });

      expect(zoneRes.statusCode).toBe(200);
      const body = zoneRes.json();
      expect(body.total).toBe(1);
      expect(body.data[0].zone).toBe('ZONE-ALPHA');
      expect(body.data[0].crop).toBe('Hydroponic Lettuce');
    });
  });

  describe('Real PostgreSQL Concurrency Test', () => {
    it('should handle genuinely concurrent batch creation requests on same tray in Postgres', async () => {
      const trayRes = await app.inject({
        method: 'POST',
        url: '/trays',
        payload: { code: 'PG-CONCURRENCY-TRAY', zone: 'ZONE-A', capacity_units: 100 },
      });
      const trayId = trayRes.json().id;

      const [r1, r2] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/batches',
          payload: {
            tray_id: trayId,
            crop: 'Concurrent Crop 1',
            seeded_on: '2026-03-01',
            expected_harvest_on: '2026-04-01',
          },
        }),
        app.inject({
          method: 'POST',
          url: '/batches',
          payload: {
            tray_id: trayId,
            crop: 'Concurrent Crop 2',
            seeded_on: '2026-03-01',
            expected_harvest_on: '2026-04-01',
          },
        }),
      ]);

      const statuses = [r1.statusCode, r2.statusCode];
      const success = statuses.filter((s) => s === 201).length;
      const conflict = statuses.filter((s) => s === 409).length;

      expect(success).toBe(1);
      expect(conflict).toBe(1);
    });
  });
});
