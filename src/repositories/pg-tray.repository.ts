import pg from 'pg';
import { ConflictError } from '../utils/errors.js';
import { ITrayRepository, Tray } from './tray.repository.js';

export class PgTrayRepository implements ITrayRepository {
  constructor(private pool: pg.Pool) {}

  async create(data: Omit<Tray, 'id' | 'created_at'>): Promise<Tray> {
    const query = `
      INSERT INTO trays (code, zone, capacity_units)
      VALUES ($1, $2, $3)
      RETURNING id, code, zone, capacity_units, created_at;
    `;
    try {
      const res = await this.pool.query(query, [
        data.code,
        data.zone,
        data.capacity_units,
      ]);
      const row = res.rows[0];
      return {
        id: row.id,
        code: row.code,
        zone: row.zone,
        capacity_units: parseInt(row.capacity_units, 10),
        created_at: row.created_at,
      };
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConflictError(
          `Tray with code '${data.code}' already exists`,
          'TRAY_CODE_EXISTS'
        );
      }
      throw err;
    }
  }

  async findAll(): Promise<Tray[]> {
    const query = `
      SELECT id, code, zone, capacity_units, created_at
      FROM trays
      ORDER BY created_at DESC;
    `;
    const res = await this.pool.query(query);
    return res.rows.map((row) => ({
      id: row.id,
      code: row.code,
      zone: row.zone,
      capacity_units: parseInt(row.capacity_units, 10),
      created_at: row.created_at,
    }));
  }

  async findById(id: string): Promise<Tray | null> {
    const query = `
      SELECT id, code, zone, capacity_units, created_at
      FROM trays
      WHERE id = $1;
    `;
    const res = await this.pool.query(query, [id]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      code: row.code,
      zone: row.zone,
      capacity_units: parseInt(row.capacity_units, 10),
      created_at: row.created_at,
    };
  }

  async findByCode(code: string): Promise<Tray | null> {
    const query = `
      SELECT id, code, zone, capacity_units, created_at
      FROM trays
      WHERE LOWER(code) = LOWER($1);
    `;
    const res = await this.pool.query(query, [code]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      code: row.code,
      zone: row.zone,
      capacity_units: parseInt(row.capacity_units, 10),
      created_at: row.created_at,
    };
  }
}
