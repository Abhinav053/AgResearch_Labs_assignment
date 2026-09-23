import { ITrayRepository, Tray } from '../repositories/tray.repository.js';
import { CreateTrayInput } from '../schemas/tray.schema.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

export class TrayService {
  constructor(private trayRepo: ITrayRepository) {}

  async createTray(input: CreateTrayInput): Promise<Tray> {
    const existing = await this.trayRepo.findByCode(input.code);
    if (existing) {
      throw new ConflictError(
        `Tray with code '${input.code}' already exists`,
        'TRAY_CODE_EXISTS'
      );
    }
    return this.trayRepo.create(input);
  }

  async getTrays(): Promise<Tray[]> {
    return this.trayRepo.findAll();
  }

  async getTrayById(id: string): Promise<Tray> {
    const tray = await this.trayRepo.findById(id);
    if (!tray) {
      throw new NotFoundError(`Tray with ID '${id}' not found`, 'TRAY_NOT_FOUND');
    }
    return tray;
  }
}
