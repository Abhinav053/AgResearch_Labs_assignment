import { Batch, BatchFilterOptions, BatchWithZone, IBatchRepository } from '../repositories/batch.repository.js';
import { ITrayRepository } from '../repositories/tray.repository.js';
import { BatchStage, CreateBatchInput } from '../schemas/batch.schema.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

const STAGE_SEQUENCE: BatchStage[] = [
  'SEEDED',
  'GERMINATION',
  'GROWING',
  'HARVEST_READY',
  'HARVESTED',
];

export class BatchService {
  constructor(
    private batchRepo: IBatchRepository,
    private trayRepo: ITrayRepository
  ) {}

  async createBatch(input: CreateBatchInput): Promise<Batch> {
    const tray = await this.trayRepo.findById(input.tray_id);
    if (!tray) {
      throw new NotFoundError(
        `Tray with ID '${input.tray_id}' not found`,
        'TRAY_NOT_FOUND'
      );
    }

    const activeBatch = await this.batchRepo.findActiveByTrayId(input.tray_id);
    if (activeBatch) {
      throw new ConflictError(
        `Tray '${input.tray_id}' already has an active batch (ID: '${activeBatch.id}', Stage: '${activeBatch.stage}')`,
        'TRAY_ALREADY_HAS_ACTIVE_BATCH'
      );
    }

    return this.batchRepo.create(input);
  }

  async advanceBatchStage(
    batchId: string,
    targetStage?: BatchStage
  ): Promise<Batch> {
    const batch = await this.batchRepo.findById(batchId);
    if (!batch) {
      throw new NotFoundError(
        `Batch with ID '${batchId}' not found`,
        'BATCH_NOT_FOUND'
      );
    }

    if (batch.stage === 'HARVESTED') {
      throw new ConflictError(
        'Batch is already HARVESTED and cannot transition further',
        'BATCH_ALREADY_HARVESTED'
      );
    }

    const currentIndex = STAGE_SEQUENCE.indexOf(batch.stage);
    const expectedNextStage = STAGE_SEQUENCE[currentIndex + 1];

    if (targetStage) {
      const targetIndex = STAGE_SEQUENCE.indexOf(targetStage);
      if (targetIndex === -1) {
        throw new ConflictError(`Invalid target stage '${targetStage}'`, 'INVALID_STAGE');
      }

      if (targetIndex <= currentIndex) {
        throw new ConflictError(
          `Cannot move stage backward or remain on same stage. Current: '${batch.stage}', Target: '${targetStage}'`,
          'INVALID_STAGE_TRANSITION'
        );
      }

      if (targetIndex > currentIndex + 1) {
        throw new ConflictError(
          `Cannot skip stage. Expected next stage is '${expectedNextStage}', but got '${targetStage}'`,
          'INVALID_STAGE_TRANSITION'
        );
      }

      if (targetStage === 'HARVESTED') {
        throw new ConflictError(
          'Cannot manually transition stage to HARVESTED. Use POST /batches/:id/harvest endpoint',
          'HARVEST_ENDPOINT_REQUIRED'
        );
      }
    } else {
      if (expectedNextStage === 'HARVESTED') {
        throw new ConflictError(
          'Batch is HARVEST_READY. Use POST /batches/:id/harvest endpoint to record harvest and transition to HARVESTED',
          'HARVEST_ENDPOINT_REQUIRED'
        );
      }
    }

    const nextStage = targetStage ?? expectedNextStage;
    const updated = await this.batchRepo.updateStage(batchId, nextStage);
    if (!updated) {
      throw new NotFoundError(`Batch with ID '${batchId}' not found`, 'BATCH_NOT_FOUND');
    }
    return updated;
  }

  async getBatchById(id: string): Promise<Batch> {
    const batch = await this.batchRepo.findById(id);
    if (!batch) {
      throw new NotFoundError(`Batch with ID '${id}' not found`, 'BATCH_NOT_FOUND');
    }
    return batch;
  }

  async getBatches(
    options: BatchFilterOptions
  ): Promise<{ data: BatchWithZone[]; total: number; page: number; limit: number }> {
    return this.batchRepo.findFiltered(options);
  }
}
