import { z } from 'zod';

export const createTraySchema = z.object({
  code: z.string().trim().min(1, 'Tray code is required'),
  zone: z.string().trim().min(1, 'Zone is required'),
  capacity_units: z
    .number({ invalid_type_error: 'capacity_units must be a number' })
    .int('capacity_units must be an integer')
    .gt(0, 'capacity_units must be greater than 0'),
});

export const getTrayParamsSchema = z.object({
  id: z.string().uuid('Invalid tray ID format'),
});

export type CreateTrayInput = z.infer<typeof createTraySchema>;
