import { randomUUID } from 'crypto';
import { BatchStage } from '../schemas/batch.schema.js';
import { ITrayRepository } from './tray.repository.js';

export interface Batch {
  id: string;
  tray_id: string;
  crop: string;
  seeded_on: string;
  stage: BatchStage;
  expected_harvest_on: string;
  created_at: Date;
}

export interface BatchWithZone extends Batch {
  zone: string;
}

export interface BatchFilterOptions {
  stage?: BatchStage;
  crop?: string;
  zone?: string;
  page: number;
  limit: number;
}

export interface IBatchRepository {
  create(data: Omit<Batch, 'id' | 'created_at' | 'stage'>): Promise<Batch>;
  findById(id: string): Promise<Batch | null>;
  findActiveByTrayId(trayId: string): Promise<Batch | null>;
  updateStage(id: string, stage: BatchStage): Promise<Batch | null>;
  findFiltered(
    options: BatchFilterOptions
  ): Promise<{ data: BatchWithZone[]; total: number; page: number; limit: number }>;
  clear?(): Promise<void>;
}

export class InMemoryBatchRepository implements IBatchRepository {
  private batches: Map<string, Batch> = new Map();

  constructor(private trayRepo?: ITrayRepository) {}

  async create(data: Omit<Batch, 'id' | 'created_at' | 'stage'>): Promise<Batch> {
    const batch: Batch = {
      id: randomUUID(),
      tray_id: data.tray_id,
      crop: data.crop,
      seeded_on: data.seeded_on,
      stage: 'SEEDED',
      expected_harvest_on: data.expected_harvest_on,
      created_at: new Date(),
    };
    this.batches.set(batch.id, batch);
    return batch;
  }

  async findById(id: string): Promise<Batch | null> {
    return this.batches.get(id) || null;
  }

  async findActiveByTrayId(trayId: string): Promise<Batch | null> {
    for (const batch of this.batches.values()) {
      if (batch.tray_id === trayId && batch.stage !== 'HARVESTED') {
        return batch;
      }
    }
    return null;
  }

  async updateStage(id: string, stage: BatchStage): Promise<Batch | null> {
    const batch = this.batches.get(id);
    if (!batch) return null;

    const updatedBatch: Batch = {
      ...batch,
      stage,
    };
    this.batches.set(id, updatedBatch);
    return updatedBatch;
  }

  async findFiltered(
    options: BatchFilterOptions
  ): Promise<{ data: BatchWithZone[]; total: number; page: number; limit: number }> {
    const { stage, crop, zone, page, limit } = options;

    let result: BatchWithZone[] = [];

    for (const batch of this.batches.values()) {
      let trayZone = '';
      if (this.trayRepo) {
        const tray = await this.trayRepo.findById(batch.tray_id);
        if (tray) trayZone = tray.zone;
      }

      const matchesStage = !stage || batch.stage === stage;
      const matchesCrop = !crop || batch.crop.toLowerCase().includes(crop.toLowerCase());
      const matchesZone = !zone || trayZone.toLowerCase() === zone.toLowerCase();

      if (matchesStage && matchesCrop && matchesZone) {
        result.push({ ...batch, zone: trayZone });
      }
    }

    result.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    const total = result.length;
    const startIndex = (page - 1) * limit;
    const paginatedData = result.slice(startIndex, startIndex + limit);

    return {
      data: paginatedData,
      total,
      page,
      limit,
    };
  }

  async clear(): Promise<void> {
    this.batches.clear();
  }
}
