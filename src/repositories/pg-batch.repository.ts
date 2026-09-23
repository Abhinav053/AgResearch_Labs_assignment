import pg from 'pg';
import { BatchStage } from '../schemas/batch.schema.js';
import { ConflictError } from '../utils/errors.js';
import { Batch, BatchFilterOptions, BatchWithZone, IBatchRepository } from './batch.repository.js';

export class PgBatchRepository implements IBatchRepository {
  constructor(private pool: pg.Pool) {}

  private formatDate(date: any): string {
    if (typeof date === 'string') return date.slice(0, 10);
    if (date instanceof Date) return date.toISOString().slice(0, 10);
    return String(date).slice(0, 10);
  }

  async create(data: Omit<Batch, 'id' | 'created_at' | 'stage'>): Promise<Batch> {
    const query = `
      INSERT INTO batches (tray_id, crop, seeded_on, stage, expected_harvest_on)
      VALUES ($1, $2, $3, 'SEEDED', $4)
      RETURNING id, tray_id, crop, seeded_on, stage, expected_harvest_on, created_at;
    `;
    try {
      const res = await this.pool.query(query, [
        data.tray_id,
        data.crop,
        data.seeded_on,
        data.expected_harvest_on,
      ]);
      const row = res.rows[0];
      return {
        id: row.id,
        tray_id: row.tray_id,
        crop: row.crop,
        seeded_on: this.formatDate(row.seeded_on),
        stage: row.stage as BatchStage,
        expected_harvest_on: this.formatDate(row.expected_harvest_on),
        created_at: row.created_at,
      };
    } catch (err: any) {
      if (err.code === '23505' && err.constraint === 'one_active_batch_per_tray') {
        throw new ConflictError(
          `Tray '${data.tray_id}' already has an active batch`,
          'TRAY_ALREADY_HAS_ACTIVE_BATCH'
        );
      }
      throw err;
    }
  }

  async findById(id: string): Promise<Batch | null> {
    const query = `
      SELECT id, tray_id, crop, seeded_on, stage, expected_harvest_on, created_at
      FROM batches
      WHERE id = $1;
    `;
    const res = await this.pool.query(query, [id]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      tray_id: row.tray_id,
      crop: row.crop,
      seeded_on: this.formatDate(row.seeded_on),
      stage: row.stage as BatchStage,
      expected_harvest_on: this.formatDate(row.expected_harvest_on),
      created_at: row.created_at,
    };
  }

  async findActiveByTrayId(trayId: string): Promise<Batch | null> {
    const query = `
      SELECT id, tray_id, crop, seeded_on, stage, expected_harvest_on, created_at
      FROM batches
      WHERE tray_id = $1 AND stage <> 'HARVESTED';
    `;
    const res = await this.pool.query(query, [trayId]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      tray_id: row.tray_id,
      crop: row.crop,
      seeded_on: this.formatDate(row.seeded_on),
      stage: row.stage as BatchStage,
      expected_harvest_on: this.formatDate(row.expected_harvest_on),
      created_at: row.created_at,
    };
  }

  async updateStage(id: string, stage: BatchStage, client?: pg.PoolClient): Promise<Batch | null> {
    const query = `
      UPDATE batches
      SET stage = $1
      WHERE id = $2
      RETURNING id, tray_id, crop, seeded_on, stage, expected_harvest_on, created_at;
    `;
    const runner = client || this.pool;
    const res = await runner.query(query, [stage, id]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      tray_id: row.tray_id,
      crop: row.crop,
      seeded_on: this.formatDate(row.seeded_on),
      stage: row.stage as BatchStage,
      expected_harvest_on: this.formatDate(row.expected_harvest_on),
      created_at: row.created_at,
    };
  }

  async findFiltered(
    options: BatchFilterOptions
  ): Promise<{ data: BatchWithZone[]; total: number; page: number; limit: number }> {
    const { stage, crop, zone, page, limit } = options;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (stage) {
      conditions.push(`b.stage = $${paramIndex++}`);
      values.push(stage);
    }

    if (crop) {
      conditions.push(`LOWER(b.crop) LIKE $${paramIndex++}`);
      values.push(`%${crop.toLowerCase()}%`);
    }

    if (zone) {
      conditions.push(`LOWER(t.zone) = $${paramIndex++}`);
      values.push(zone.toLowerCase());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM batches b
      JOIN trays t ON b.tray_id = t.id
      ${whereClause};
    `;

    const countRes = await this.pool.query(countQuery, values);
    const total = parseInt(countRes.rows[0].total, 10);

    const offset = (page - 1) * limit;
    const dataQuery = `
      SELECT b.id, b.tray_id, b.crop, b.seeded_on, b.stage, b.expected_harvest_on, b.created_at, t.zone
      FROM batches b
      JOIN trays t ON b.tray_id = t.id
      ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++};
    `;

    const dataRes = await this.pool.query(dataQuery, [...values, limit, offset]);

    const data: BatchWithZone[] = dataRes.rows.map((row) => ({
      id: row.id,
      tray_id: row.tray_id,
      crop: row.crop,
      seeded_on: this.formatDate(row.seeded_on),
      stage: row.stage as BatchStage,
      expected_harvest_on: this.formatDate(row.expected_harvest_on),
      created_at: row.created_at,
      zone: row.zone,
    }));

    return {
      data,
      total,
      page,
      limit,
    };
  }
}
