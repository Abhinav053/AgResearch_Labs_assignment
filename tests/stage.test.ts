import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { InMemoryBatchRepository } from '../src/repositories/batch.repository.js';
import { InMemoryTrayRepository } from '../src/repositories/tray.repository.js';

describe('Batch Stage Transitions (Phase 2)', () => {
  let app: ReturnType<typeof buildApp>;
  let trayId: string;
  let batchId: string;

  beforeEach(async () => {
    const trayRepo = new InMemoryTrayRepository();
    const batchRepo = new InMemoryBatchRepository(trayRepo);
    app = buildApp({ trayRepo, batchRepo });

    const trayRes = await app.inject({
      method: 'POST',
      url: '/trays',
      payload: { code: 'STAGE-TRAY-01', zone: 'ZONE-A', capacity_units: 50 },
    });
    trayId = trayRes.json().id;

    const batchRes = await app.inject({
      method: 'POST',
      url: '/batches',
      payload: {
        tray_id: trayId,
        crop: 'Spinach',
        seeded_on: '2026-03-01',
        expected_harvest_on: '2026-04-01',
      },
    });
    batchId = batchRes.json().id;
  });

  it('should advance batch stage forward one step sequentially', async () => {
    // SEEDED -> GERMINATION
    const step1 = await app.inject({
      method: 'PATCH',
      url: `/batches/${batchId}/stage`,
      payload: { target_stage: 'GERMINATION' },
    });
    expect(step1.statusCode).toBe(200);
    expect(step1.json().stage).toBe('GERMINATION');

    // GERMINATION -> GROWING (Auto advance without body)
    const step2 = await app.inject({
      method: 'PATCH',
      url: `/batches/${batchId}/stage`,
    });
    expect(step2.statusCode).toBe(200);
    expect(step2.json().stage).toBe('GROWING');

    // GROWING -> HARVEST_READY
    const step3 = await app.inject({
      method: 'PATCH',
      url: `/batches/${batchId}/stage`,
      payload: { target_stage: 'HARVEST_READY' },
    });
    expect(step3.statusCode).toBe(200);
    expect(step3.json().stage).toBe('HARVEST_READY');
  });

  it('should reject skipping stages (409 Conflict)', async () => {
    // Attempt SEEDED -> GROWING directly
    const response = await app.inject({
      method: 'PATCH',
      url: `/batches/${batchId}/stage`,
      payload: { target_stage: 'GROWING' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('INVALID_STAGE_TRANSITION');
  });

  it('should reject moving stage backward (409 Conflict)', async () => {
    // Advance to GERMINATION first
    await app.inject({
      method: 'PATCH',
      url: `/batches/${batchId}/stage`,
      payload: { target_stage: 'GERMINATION' },
    });

    // Attempt GERMINATION -> SEEDED
    const response = await app.inject({
      method: 'PATCH',
      url: `/batches/${batchId}/stage`,
      payload: { target_stage: 'SEEDED' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('INVALID_STAGE_TRANSITION');
  });

  it('should reject transitioning to HARVESTED via stage patch (409 Conflict)', async () => {
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

    // Attempt patch to HARVESTED
    const response = await app.inject({
      method: 'PATCH',
      url: `/batches/${batchId}/stage`,
      payload: { target_stage: 'HARVESTED' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('HARVEST_ENDPOINT_REQUIRED');
  });
});
