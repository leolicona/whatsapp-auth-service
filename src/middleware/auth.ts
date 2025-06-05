import { Context, Next } from 'hono';
import { AuthService } from '../services/auth';
import { Env, AuthInfo, Variables } from '../types';

export async function authMiddleware(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, next: Next) {
  const services = c.get('services');
  const authService = services.auth;

  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  const token = authHeader.substring(7);
  const authInfo: AuthInfo | null = await authService.validateAuthToken(token);
  
  if (!authInfo) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
  
  // Add auth info to the context for use in route handlers
  c.set('authInfo', authInfo);
  
  await next();
};