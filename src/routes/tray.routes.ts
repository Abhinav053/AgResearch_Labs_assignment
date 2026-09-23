import { FastifyInstance } from 'fastify';
import { TrayController } from '../controllers/tray.controller.js';

export async function trayRoutes(
  fastify: FastifyInstance,
  options: { trayController: TrayController }
) {
  const { trayController } = options;

  fastify.post('/trays', trayController.createTray);
  fastify.get('/trays', trayController.getTrays);
  fastify.get('/trays/:id', trayController.getTrayById);
}
