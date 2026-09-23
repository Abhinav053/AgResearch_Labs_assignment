import { FastifyInstance } from 'fastify';
import { BatchController } from '../controllers/batch.controller.js';

export async function batchRoutes(
  fastify: FastifyInstance,
  options: { batchController: BatchController }
) {
  const { batchController } = options;

  fastify.post('/batches', batchController.createBatch);
  fastify.get('/batches', batchController.getBatches);
  fastify.get('/batches/:id', batchController.getBatchById);
  fastify.patch('/batches/:id/stage', batchController.advanceStage);
  fastify.post('/batches/:id/harvest', batchController.recordHarvest);
}
