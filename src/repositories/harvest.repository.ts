import { randomUUID } from 'crypto';
import { HarvestGrade } from '../schemas/harvest.schema.js';

export interface Harvest {
  id: string;
  batch_id: string;
  harvested_on: string;
  weight_grams: number;
  grade: HarvestGrade;
  created_at: Date;
}

export interface IHarvestRepository {
  create(data: Omit<Harvest, 'id' | 'created_at'>): Promise<Harvest>;
  findByBatchId(batchId: string): Promise<Harvest | null>;
  clear?(): Promise<void>;
}

export class InMemoryHarvestRepository implements IHarvestRepository {
  private harvests: Map<string, Harvest> = new Map();

  async create(data: Omit<Harvest, 'id' | 'created_at'>): Promise<Harvest> {
    const harvest: Harvest = {
      id: randomUUID(),
      batch_id: data.batch_id,
      harvested_on: data.harvested_on,
      weight_grams: data.weight_grams,
      grade: data.grade,
      created_at: new Date(),
    };
    this.harvests.set(harvest.id, harvest);
    return harvest;
  }

  async findByBatchId(batchId: string): Promise<Harvest | null> {
    for (const harvest of this.harvests.values()) {
      if (harvest.batch_id === batchId) {
        return harvest;
      }
    }
    return null;
  }

  async clear(): Promise<void> {
    this.harvests.clear();
  }
}
