import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createBatchSchema,
  getBatchParamsSchema,
  getBatchesQuerySchema,
  updateBatchStageSchema,
} from '../schemas/batch.schema.js';
import { createHarvestSchema } from '../schemas/harvest.schema.js';
import { BatchService } from '../services/batch.service.js';
import { HarvestService } from '../services/harvest.service.js';

export class BatchController {
  constructor(
    private batchService: BatchService,
    private harvestService: HarvestService
  ) {}

  createBatch = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = createBatchSchema.parse(request.body);
    const batch = await this.batchService.createBatch(input);
    return reply.status(201).send(batch);
  };

  advanceStage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = getBatchParamsSchema.parse(request.params);
    const body = updateBatchStageSchema.parse(request.body || {});
    const updated = await this.batchService.advanceBatchStage(id, body.target_stage);
    return reply.status(200).send(updated);
  };

  recordHarvest = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = getBatchParamsSchema.parse(request.params);
    const input = createHarvestSchema.parse(request.body);
    const harvest = await this.harvestService.recordHarvest(id, input);
    return reply.status(201).send(harvest);
  };

  getBatches = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = getBatchesQuerySchema.parse(request.query);
    const result = await this.batchService.getBatches(query);
    return reply.status(200).send(result);
  };

  getBatchById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = getBatchParamsSchema.parse(request.params);
    const batch = await this.batchService.getBatchById(id);
    return reply.status(200).send(batch);
  };
}
