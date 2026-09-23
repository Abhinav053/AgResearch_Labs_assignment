import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { InMemoryTrayRepository } from '../src/repositories/tray.repository.js';

describe('Tray Endpoints (Phase 1)', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp({
      trayRepo: new InMemoryTrayRepository(),
    });
  });

  describe('POST /trays', () => {
    it('should create a new tray with valid payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/trays',
        payload: {
          code: 'TRAY-001',
          zone: 'ZONE-A',
          capacity_units: 50,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toHaveProperty('id');
      expect(body.code).toBe('TRAY-001');
      expect(body.zone).toBe('ZONE-A');
      expect(body.capacity_units).toBe(50);
      expect(body).toHaveProperty('created_at');
    });

    it('should reject creation with missing code (400)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/trays',
        payload: {
          zone: 'ZONE-A',
          capacity_units: 50,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject creation with capacity_units <= 0 (400)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/trays',
        payload: {
          code: 'TRAY-002',
          zone: 'ZONE-A',
          capacity_units: 0,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject creation with duplicate tray code (409)', async () => {
      await app.inject({
        method: 'POST',
        url: '/trays',
        payload: {
          code: 'TRAY-DUP',
          zone: 'ZONE-A',
          capacity_units: 30,
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/trays',
        payload: {
          code: 'TRAY-DUP',
          zone: 'ZONE-B',
          capacity_units: 40,
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('TRAY_CODE_EXISTS');
    });
  });

  describe('GET /trays', () => {
    it('should return empty list when no trays exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/trays',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('should return list of trays', async () => {
      await app.inject({
        method: 'POST',
        url: '/trays',
        payload: { code: 'T1', zone: 'Z1', capacity_units: 10 },
      });
      await app.inject({
        method: 'POST',
        url: '/trays',
        payload: { code: 'T2', zone: 'Z2', capacity_units: 20 },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/trays',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.length).toBe(2);
    });
  });

  describe('GET /trays/:id', () => {
    it('should return tray by ID', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/trays',
        payload: { code: 'TRAY-FIND', zone: 'Z1', capacity_units: 15 },
      });
      const created = createRes.json();

      const response = await app.inject({
        method: 'GET',
        url: `/trays/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().code).toBe('TRAY-FIND');
    });

    it('should return 404 if tray does not exist', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const response = await app.inject({
        method: 'GET',
        url: `/trays/${fakeUuid}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('TRAY_NOT_FOUND');
    });

    it('should return 400 if tray ID format is invalid', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/trays/not-a-uuid',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });
  });
});
