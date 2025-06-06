import { zValidator } from '@hono/zod-validator';
import { z, ZodSchema } from 'zod';

export const phoneSchema = z.object({
  phone_number: z.string().min(10).max(15)
});

export const tokenSchema = z.object({
  token: z.string().min(10)
});

export function createJsonValidator<T extends ZodSchema>(schema: T) {
  return zValidator('json', schema);
}

// We will now use createJsonValidator(phoneSchema) instead of validatePhone
// export const validatePhone = zValidator('json', phoneSchema);
export const validateToken = createJsonValidator(tokenSchema);