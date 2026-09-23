import pg from 'pg';
import { ConflictError } from '../utils/errors.js';
import { Harvest, IHarvestRepository } from './harvest.repository.js';

export class PgHarvestRepository implements IHarvestRepository {
  constructor(private pool: pg.Pool) {}

  private formatDate(date: any): string {
    if (typeof date === 'string') return date.slice(0, 10);
    if (date instanceof Date) return date.toISOString().slice(0, 10);
    return String(date).slice(0, 10);
  }

  async create(data: Omit<Harvest, 'id' | 'created_at'>, client?: pg.PoolClient): Promise<Harvest> {
    const query = `
      INSERT INTO harvests (batch_id, harvested_on, weight_grams, grade)
      VALUES ($1, $2, $3, $4)
      RETURNING id, batch_id, harvested_on, weight_grams, grade, created_at;
    `;
    const runner = client || this.pool;
    try {
      const res = await runner.query(query, [
        data.batch_id,
        data.harvested_on,
        data.weight_grams,
        data.grade,
      ]);
      const row = res.rows[0];
      return {
        id: row.id,
        batch_id: row.batch_id,
        harvested_on: this.formatDate(row.harvested_on),
        weight_grams: parseFloat(row.weight_grams),
        grade: row.grade,
        created_at: row.created_at,
      };
    } catch (err: any) {
      if (err.code === '23505' && err.constraint === 'harvests_batch_id_key') {
        throw new ConflictError(
          `Harvest already exists for batch '${data.batch_id}'`,
          'HARVEST_ALREADY_EXISTS'
        );
      }
      throw err;
    }
  }

  async findByBatchId(batchId: string, client?: pg.PoolClient): Promise<Harvest | null> {
    const query = `
      SELECT id, batch_id, harvested_on, weight_grams, grade, created_at
      FROM harvests
      WHERE batch_id = $1;
    `;
    const runner = client || this.pool;
    const res = await runner.query(query, [batchId]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      batch_id: row.batch_id,
      harvested_on: this.formatDate(row.harvested_on),
      weight_grams: parseFloat(row.weight_grams),
      grade: row.grade,
      created_at: row.created_at,
    };
  }

  // Method to execute harvest recording atomically in a PostgreSQL Transaction
  async createHarvestTransaction(
    batchId: string,
    data: Omit<Harvest, 'id' | 'created_at' | 'batch_id'>
  ): Promise<Harvest> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Lock batch for update and verify state
      const batchRes = await client.query(
        'SELECT id, stage, seeded_on FROM batches WHERE id = $1 FOR UPDATE;',
        [batchId]
      );

      if (batchRes.rows.length === 0) {
        throw new ConflictError(`Batch with ID '${batchId}' not found`, 'BATCH_NOT_FOUND');
      }

      const batch = batchRes.rows[0];

      if (batch.stage !== 'HARVEST_READY') {
        throw new ConflictError(
          `Harvest can only be recorded when batch is in HARVEST_READY stage. Current stage: '${batch.stage}'`,
          'BATCH_NOT_HARVEST_READY'
        );
      }

      // Check date
      const seededDate = new Date(batch.seeded_on);
      const harvestDate = new Date(data.harvested_on);
      if (harvestDate < seededDate) {
        throw new ConflictError(
          `harvested_on date (${data.harvested_on}) cannot be before batch seeded_on date (${batch.seeded_on})`,
          'INVALID_HARVEST_DATE'
        );
      }

      // 2. Insert harvest record
      const harvest = await this.create(
        {
          batch_id: batchId,
          harvested_on: data.harvested_on,
          weight_grams: data.weight_grams,
          grade: data.grade,
        },
        client
      );

      // 3. Transition batch stage to HARVESTED
      await client.query(
        "UPDATE batches SET stage = 'HARVESTED' WHERE id = $1;",
        [batchId]
      );

      await client.query('COMMIT;');
      return harvest;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }
}
