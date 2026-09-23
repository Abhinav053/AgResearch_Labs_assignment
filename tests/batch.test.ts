import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { InMemoryBatchRepository } from '../src/repositories/batch.repository.js';
import { InMemoryTrayRepository } from '../src/repositories/tray.repository.js';

describe('Batch Endpoints (Phase 1)', () => {
  let app: ReturnType<typeof buildApp>;
  let trayId: string;

  beforeEach(async () => {
    const trayRepo = new InMemoryTrayRepository();
    const batchRepo = new InMemoryBatchRepository(trayRepo);
    app = buildApp({ trayRepo, batchRepo });

    const createTrayRes = await app.inject({
      method: 'POST',
      url: '/trays',
      payload: {
        code: 'TRAY-BATCH-01',
        zone: 'ZONE-A',
        capacity_units: 100,
      },
    });
    trayId = createTrayRes.json().id;
  });

  describe('POST /batches', () => {
    it('should seed a new batch into an available tray (201)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Romaine Lettuce',
          seeded_on: '2026-03-01',
          expected_harvest_on: '2026-04-01',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toHaveProperty('id');
      expect(body.tray_id).toBe(trayId);
      expect(body.crop).toBe('Romaine Lettuce');
      expect(body.stage).toBe('SEEDED');
      expect(body.seeded_on).toBe('2026-03-01');
      expect(body.expected_harvest_on).toBe('2026-04-01');
    });

    it('should reject batch seeding if tray already has an active batch (409)', async () => {
      // First batch
      await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Butterhead Lettuce',
          seeded_on: '2026-03-01',
          expected_harvest_on: '2026-04-01',
        },
      });

      // Second batch in same tray
      const response = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Kale',
          seeded_on: '2026-03-02',
          expected_harvest_on: '2026-04-02',
        },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe('TRAY_ALREADY_HAS_ACTIVE_BATCH');
    });

    it('should return 404 if tray_id does not exist', async () => {
      const nonExistentUuid = '00000000-0000-4000-8000-000000000000';
      const response = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: nonExistentUuid,
          crop: 'Spinach',
          seeded_on: '2026-03-01',
          expected_harvest_on: '2026-04-01',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('TRAY_NOT_FOUND');
    });

    it('should return 400 if expected_harvest_on is before seeded_on', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Arugula',
          seeded_on: '2026-04-01',
          expected_harvest_on: '2026-03-01',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid date format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Basil',
          seeded_on: '03-01-2026',
          expected_harvest_on: '2026-04-01',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });
  });
});
