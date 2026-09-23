import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { InMemoryBatchRepository } from '../src/repositories/batch.repository.js';
import { InMemoryHarvestRepository } from '../src/repositories/harvest.repository.js';
import { InMemoryTrayRepository } from '../src/repositories/tray.repository.js';

describe('Harvest Recording & Tray Reuse (Phase 2)', () => {
  let app: ReturnType<typeof buildApp>;
  let trayId: string;
  let batchId: string;

  beforeEach(async () => {
    const trayRepo = new InMemoryTrayRepository();
    const batchRepo = new InMemoryBatchRepository(trayRepo);
    const harvestRepo = new InMemoryHarvestRepository();
    app = buildApp({ trayRepo, batchRepo, harvestRepo });

    const trayRes = await app.inject({
      method: 'POST',
      url: '/trays',
      payload: { code: 'HARVEST-TRAY-01', zone: 'ZONE-B', capacity_units: 75 },
    });
    trayId = trayRes.json().id;

    const batchRes = await app.inject({
      method: 'POST',
      url: '/batches',
      payload: {
        tray_id: trayId,
        crop: 'Kale',
        seeded_on: '2026-03-01',
        expected_harvest_on: '2026-04-01',
      },
    });
    batchId = batchRes.json().id;
  });

  it('should reject recording harvest when batch is not HARVEST_READY (409)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/batches/${batchId}/harvest`,
      payload: {
        harvested_on: '2026-04-01',
        weight_grams: 450.5,
        grade: 'A',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('BATCH_NOT_HARVEST_READY');
  });

  it('should record harvest and transition batch to HARVESTED when HARVEST_READY', async () => {
    // Advance batch to HARVEST_READY
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
    const response = await app.inject({
      method: 'POST',
      url: `/batches/${batchId}/harvest`,
      payload: {
        harvested_on: '2026-04-01',
        weight_grams: 520.0,
        grade: 'A',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toHaveProperty('id');
    expect(body.batch_id).toBe(batchId);
    expect(body.weight_grams).toBe(520.0);
    expect(body.grade).toBe('A');

    // Verify batch stage is now HARVESTED
    const getBatchRes = await app.inject({
      method: 'GET',
      url: `/batches/${batchId}`,
    });
    expect(getBatchRes.json().stage).toBe('HARVESTED');
  });

  it('should allow tray reuse after batch is HARVESTED', async () => {
    // Advance to HARVEST_READY and harvest
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
      payload: {
        harvested_on: '2026-04-01',
        weight_grams: 500,
        grade: 'B',
      },
    });

    // Seed NEW batch into same tray
    const newBatchRes = await app.inject({
      method: 'POST',
      url: '/batches',
      payload: {
        tray_id: trayId,
        crop: 'Basil',
        seeded_on: '2026-04-05',
        expected_harvest_on: '2026-05-05',
      },
    });

    expect(newBatchRes.statusCode).toBe(201);
    expect(newBatchRes.json().crop).toBe('Basil');
  });

  it('should prevent multiple harvests for the same batch (409)', async () => {
    // Advance and harvest
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
      payload: {
        harvested_on: '2026-04-01',
        weight_grams: 500,
        grade: 'A',
      },
    });

    // Attempt second harvest
    const secondHarvestRes = await app.inject({
      method: 'POST',
      url: `/batches/${batchId}/harvest`,
      payload: {
        harvested_on: '2026-04-02',
        weight_grams: 300,
        grade: 'B',
      },
    });

    expect(secondHarvestRes.statusCode).toBe(409);
  });
});
