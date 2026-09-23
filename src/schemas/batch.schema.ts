import { z } from 'zod';

export const BATCH_STAGES = [
  'SEEDED',
  'GERMINATION',
  'GROWING',
  'HARVEST_READY',
  'HARVESTED',
] as const;

export type BatchStage = (typeof BATCH_STAGES)[number];

const dateStringRegex = /^\d{4}-\d{2}-\d{2}$/;

export const createBatchSchema = z.object({
  tray_id: z.string().uuid('Invalid tray_id format'),
  crop: z.string().trim().min(1, 'Crop name is required'),
  seeded_on: z
    .string()
    .regex(dateStringRegex, 'seeded_on must be in YYYY-MM-DD format')
    .refine((val) => !isNaN(Date.parse(val)), 'seeded_on must be a valid date'),
  expected_harvest_on: z
    .string()
    .regex(dateStringRegex, 'expected_harvest_on must be in YYYY-MM-DD format')
    .refine((val) => !isNaN(Date.parse(val)), 'expected_harvest_on must be a valid date'),
}).refine(
  (data) => new Date(data.expected_harvest_on) >= new Date(data.seeded_on),
  {
    message: 'expected_harvest_on cannot be before seeded_on',
    path: ['expected_harvest_on'],
  }
);

export const updateBatchStageSchema = z.object({
  target_stage: z.enum(BATCH_STAGES).optional(),
});

export const getBatchParamsSchema = z.object({
  id: z.string().uuid('Invalid batch ID format'),
});

export const getBatchesQuerySchema = z.object({
  stage: z.enum(BATCH_STAGES).optional(),
  crop: z.string().optional(),
  zone: z.string().optional(),
  page: z.coerce.number().int().gt(0).default(1),
  limit: z.coerce.number().int().gt(0).lte(100).default(20),
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type UpdateBatchStageInput = z.infer<typeof updateBatchStageSchema>;
export type GetBatchesQueryInput = z.infer<typeof getBatchesQuerySchema>;
