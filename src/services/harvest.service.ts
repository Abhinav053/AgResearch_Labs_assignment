import { IBatchRepository } from '../repositories/batch.repository.js';
import { Harvest, IHarvestRepository } from '../repositories/harvest.repository.js';
import { CreateHarvestInput } from '../schemas/harvest.schema.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

export class HarvestService {
  constructor(
    private harvestRepo: IHarvestRepository,
    private batchRepo: IBatchRepository
  ) {}

  async recordHarvest(batchId: string, input: CreateHarvestInput): Promise<Harvest> {
    // If PostgreSQL repository with transaction support is available, use it
    if (
      'createHarvestTransaction' in this.harvestRepo &&
      typeof (this.harvestRepo as any).createHarvestTransaction === 'function'
    ) {
      return (this.harvestRepo as any).createHarvestTransaction(batchId, input);
    }

    // Fallback logic for In-Memory storage (Phase 1)
    const batch = await this.batchRepo.findById(batchId);
    if (!batch) {
      throw new NotFoundError(
        `Batch with ID '${batchId}' not found`,
        'BATCH_NOT_FOUND'
      );
    }

    if (batch.stage !== 'HARVEST_READY') {
      throw new ConflictError(
        `Harvest can only be recorded when batch is in HARVEST_READY stage. Current stage: '${batch.stage}'`,
        'BATCH_NOT_HARVEST_READY'
      );
    }

    const existingHarvest = await this.harvestRepo.findByBatchId(batchId);
    if (existingHarvest) {
      throw new ConflictError(
        `Harvest already exists for batch '${batchId}'`,
        'HARVEST_ALREADY_EXISTS'
      );
    }

    const seededDate = new Date(batch.seeded_on);
    const harvestDate = new Date(input.harvested_on);
    if (harvestDate < seededDate) {
      throw new ConflictError(
        `harvested_on date (${input.harvested_on}) cannot be before batch seeded_on date (${batch.seeded_on})`,
        'INVALID_HARVEST_DATE'
      );
    }

    const harvest = await this.harvestRepo.create({
      batch_id: batchId,
      harvested_on: input.harvested_on,
      weight_grams: input.weight_grams,
      grade: input.grade,
    });

    await this.batchRepo.updateStage(batchId, 'HARVESTED');

    return harvest;
  }
}
