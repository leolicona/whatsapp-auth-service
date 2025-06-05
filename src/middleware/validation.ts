import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

export const phoneSchema = z.object({
  phone_number: z.string().min(10).max(15)
});

export const tokenSchema = z.object({
  token: z.string().min(10)
});

export const validatePhone = zValidator('json', phoneSchema);
export const validateToken = zValidator('json', tokenSchema);