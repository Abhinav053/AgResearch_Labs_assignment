import { FastifyReply, FastifyRequest } from 'fastify';
import { createTraySchema, getTrayParamsSchema } from '../schemas/tray.schema.js';
import { TrayService } from '../services/tray.service.js';

export class TrayController {
  constructor(private trayService: TrayService) {}

  createTray = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = createTraySchema.parse(request.body);
    const tray = await this.trayService.createTray(input);
    return reply.status(201).send(tray);
  };

  getTrays = async (_request: FastifyRequest, reply: FastifyReply) => {
    const trays = await this.trayService.getTrays();
    return reply.status(200).send(trays);
  };

  getTrayById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = getTrayParamsSchema.parse(request.params);
    const tray = await this.trayService.getTrayById(id);
    return reply.status(200).send(tray);
  };
}
