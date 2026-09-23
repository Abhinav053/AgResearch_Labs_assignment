import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { InMemoryBatchRepository } from '../src/repositories/batch.repository.js';
import { InMemoryTrayRepository } from '../src/repositories/tray.repository.js';

describe('GET /batches Filtering & Pagination (Phase 2)', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    const trayRepo = new InMemoryTrayRepository();
    const batchRepo = new InMemoryBatchRepository(trayRepo);
    app = buildApp({ trayRepo, batchRepo });

    // Tray 1 in Zone A
    const t1 = await app.inject({
      method: 'POST',
      url: '/trays',
      payload: { code: 'T1', zone: 'ZONE-A', capacity_units: 50 },
    });
    const t1Id = t1.json().id;

    // Tray 2 in Zone B
    const t2 = await app.inject({
      method: 'POST',
      url: '/trays',
      payload: { code: 'T2', zone: 'ZONE-B', capacity_units: 50 },
    });
    const t2Id = t2.json().id;

    // Batch 1: Romaine Lettuce, Zone A, SEEDED
    await app.inject({
      method: 'POST',
      url: '/batches',
      payload: {
        tray_id: t1Id,
        crop: 'Romaine Lettuce',
        seeded_on: '2026-03-01',
        expected_harvest_on: '2026-04-01',
      },
    });

    // Batch 2: Spinach, Zone B, SEEDED -> GERMINATION
    const b2 = await app.inject({
      method: 'POST',
      url: '/batches',
      payload: {
        tray_id: t2Id,
        crop: 'Spinach',
        seeded_on: '2026-03-02',
        expected_harvest_on: '2026-04-02',
      },
    });
    await app.inject({
      method: 'PATCH',
      url: `/batches/${b2.json().id}/stage`,
      payload: { target_stage: 'GERMINATION' },
    });
  });

  it('should list all batches with pagination defaults', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/batches',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
    expect(body.total).toBe(2);
    expect(body.data.length).toBe(2);
  });

  it('should filter batches by stage', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/batches?stage=GERMINATION',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.data[0].crop).toBe('Spinach');
    expect(body.data[0].stage).toBe('GERMINATION');
  });

  it('should filter batches by crop', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/batches?crop=romaine',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.data[0].crop).toBe('Romaine Lettuce');
  });

  it('should filter batches by zone', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/batches?zone=ZONE-B',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.data[0].zone).toBe('ZONE-B');
    expect(body.data[0].crop).toBe('Spinach');
  });
});
