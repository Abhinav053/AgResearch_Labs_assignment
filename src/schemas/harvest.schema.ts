import { z } from 'zod';

export const HARVEST_GRADES = ['A', 'B', 'C'] as const;
export type HarvestGrade = (typeof HARVEST_GRADES)[number];

const dateStringRegex = /^\d{4}-\d{2}-\d{2}$/;

export const createHarvestSchema = z.object({
  harvested_on: z
    .string()
    .regex(dateStringRegex, 'harvested_on must be in YYYY-MM-DD format')
    .refine((val) => !isNaN(Date.parse(val)), 'harvested_on must be a valid date'),
  weight_grams: z
    .number({ invalid_type_error: 'weight_grams must be a number' })
    .gte(0, 'weight_grams cannot be negative'),
  grade: z.enum(HARVEST_GRADES, {
    errorMap: () => ({ message: 'grade must be A, B, or C' }),
  }),
});

export type CreateHarvestInput = z.infer<typeof createHarvestSchema>;
