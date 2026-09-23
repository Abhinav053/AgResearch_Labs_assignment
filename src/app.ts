import Fastify from 'fastify';
import { ZodError } from 'zod';
import { BatchController } from './controllers/batch.controller.js';
import { TrayController } from './controllers/tray.controller.js';
import { IBatchRepository, InMemoryBatchRepository } from './repositories/batch.repository.js';
import { IHarvestRepository, InMemoryHarvestRepository } from './repositories/harvest.repository.js';
import { InMemoryTrayRepository, ITrayRepository } from './repositories/tray.repository.js';
import { batchRoutes } from './routes/batch.routes.js';
import { trayRoutes } from './routes/tray.routes.js';
import { BatchService } from './services/batch.service.js';
import { HarvestService } from './services/harvest.service.js';
import { TrayService } from './services/tray.service.js';
import { AppError } from './utils/errors.js';

export interface AppOptions {
  trayRepo?: ITrayRepository;
  batchRepo?: IBatchRepository;
  harvestRepo?: IHarvestRepository;
}

export function buildApp(options: AppOptions = {}) {
  const fastify = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  // Repositories (Defaults to In-Memory if not provided)
  const trayRepo = options.trayRepo || new InMemoryTrayRepository();
  const batchRepo = options.batchRepo || new InMemoryBatchRepository(trayRepo);
  const harvestRepo = options.harvestRepo || new InMemoryHarvestRepository();

  // Services
  const trayService = new TrayService(trayRepo);
  const batchService = new BatchService(batchRepo, trayRepo);
  const harvestService = new HarvestService(harvestRepo, batchRepo);

  // Controllers
  const trayController = new TrayController(trayService);
  const batchController = new BatchController(batchService, harvestService);

  // Global Error Handler
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError || error.name === 'ZodError') {
      const zodErr = error as ZodError;
      const messages = zodErr.errors
        ? zodErr.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
        : zodErr.message;
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: messages || 'Invalid input data',
        },
      });
    }

    if (error instanceof AppError || (error as any).isAppError) {
      const appErr = error as AppError;
      return reply.status(appErr.statusCode).send({
        error: {
          code: appErr.code,
          message: appErr.message,
        },
      });
    }

    // Fastify built-in HTTP errors (e.g. 400 Bad Request on JSON parse failure)
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: {
          code: 'BAD_REQUEST',
          message: error.message,
        },
      });
    }

    fastify.log.error(error);
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
  });

  // Register Routes
  fastify.register(trayRoutes, { trayController });
  fastify.register(batchRoutes, { batchController });

  return fastify;
}
