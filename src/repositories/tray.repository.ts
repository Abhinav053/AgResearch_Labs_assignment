import { randomUUID } from 'crypto';

export interface Tray {
  id: string;
  code: string;
  zone: string;
  capacity_units: number;
  created_at: Date;
}

export interface ITrayRepository {
  create(data: Omit<Tray, 'id' | 'created_at'>): Promise<Tray>;
  findAll(): Promise<Tray[]>;
  findById(id: string): Promise<Tray | null>;
  findByCode(code: string): Promise<Tray | null>;
  clear?(): Promise<void>;
}

export class InMemoryTrayRepository implements ITrayRepository {
  private trays: Map<string, Tray> = new Map();

  async create(data: Omit<Tray, 'id' | 'created_at'>): Promise<Tray> {
    const tray: Tray = {
      id: randomUUID(),
      code: data.code,
      zone: data.zone,
      capacity_units: data.capacity_units,
      created_at: new Date(),
    };
    this.trays.set(tray.id, tray);
    return tray;
  }

  async findAll(): Promise<Tray[]> {
    return Array.from(this.trays.values()).sort(
      (a, b) => b.created_at.getTime() - a.created_at.getTime()
    );
  }

  async findById(id: string): Promise<Tray | null> {
    return this.trays.get(id) || null;
  }

  async findByCode(code: string): Promise<Tray | null> {
    for (const tray of this.trays.values()) {
      if (tray.code.toLowerCase() === code.toLowerCase()) {
        return tray;
      }
    }
    return null;
  }

  async clear(): Promise<void> {
    this.trays.clear();
  }
}
