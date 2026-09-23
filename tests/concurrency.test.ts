import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { InMemoryBatchRepository } from '../src/repositories/batch.repository.js';
import { InMemoryTrayRepository } from '../src/repositories/tray.repository.js';

describe('Concurrency Safety — Phase 3a', () => {
  let app: ReturnType<typeof buildApp>;
  let trayId: string;

  beforeEach(async () => {
    const trayRepo = new InMemoryTrayRepository();
    const batchRepo = new InMemoryBatchRepository(trayRepo);
    app = buildApp({ trayRepo, batchRepo });

    const trayRes = await app.inject({
      method: 'POST',
      url: '/trays',
      payload: { code: 'CONCURRENCY-TRAY-01', zone: 'ZONE-C', capacity_units: 100 },
    });
    trayId = trayRes.json().id;
  });

  it('should allow exactly ONE successful batch creation under concurrent requests and reject the other with 409 Conflict', async () => {
    // Initiate two genuinely concurrent HTTP requests using Promise.all
    const request1 = app.inject({
      method: 'POST',
      url: '/batches',
      payload: {
        tray_id: trayId,
        crop: 'Crop A (Concurrent)',
        seeded_on: '2026-03-01',
        expected_harvest_on: '2026-04-01',
      },
    });

    const request2 = app.inject({
      method: 'POST',
      url: '/batches',
      payload: {
        tray_id: trayId,
        crop: 'Crop B (Concurrent)',
        seeded_on: '2026-03-01',
        expected_harvest_on: '2026-04-01',
      },
    });

    const [res1, res2] = await Promise.all([request1, request2]);

    const statuses = [res1.statusCode, res2.statusCode];
    const successfulRequests = statuses.filter((s) => s === 201).length;
    const conflictRequests = statuses.filter((s) => s === 409).length;

    // Concurrency invariant verification
    expect(successfulRequests).toBe(1);
    expect(conflictRequests).toBe(1);

    const conflictResponse = res1.statusCode === 409 ? res1 : res2;
    expect(conflictResponse.json().error.code).toBe('TRAY_ALREADY_HAS_ACTIVE_BATCH');
  });
});
