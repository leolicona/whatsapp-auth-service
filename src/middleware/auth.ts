import { Context, Next } from 'hono';
import { AuthService } from '../services/auth';
import { Env } from '../types';

export function authMiddleware(authService: AuthService) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const token = authHeader.substring(7);
    const authInfo = await authService.validateAuthToken(token);
    
    if (!authInfo) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }
    
    // Add auth info to the context for use in route handlers
    c.set('authInfo', authInfo);
    
    await next();
  };
}