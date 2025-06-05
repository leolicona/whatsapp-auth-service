import { Hono, Context } from 'hono';
import { AuthService } from '../services/auth';
import { validatePhone, validateToken } from '../middleware/validation';
import { authMiddleware } from '../middleware/auth';
import { Env, Variables } from '../types';

export async function handleLogin(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, authService: AuthService) {
  const { phone_number } = await c.req.json();
  const result = await authService.initiateLogin(phone_number);
  
  if (result.success) {
    return c.json({ success: true, message: 'Login link sent via WhatsApp', sessionId: result.sessionId });
  } else {
    return c.json({ success: false, error: 'Failed to send login link' }, 500);
  }
}

export async function handleVerify(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, authService: AuthService) {
  const { token } = await c.req.json();
  const result = await authService.verifyLogin(token);
  
  if (result) {
    return c.json({ success: true, auth_token: result.authToken });
  } else {
    return c.json({ success: false, error: 'Invalid or expired token' }, 400);
  }
}

export async function handleLogout(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>) {
  const services = c.get('services');
  const authService = services.auth;
  const authInfo = c.get('authInfo'); // authInfo is set by authMiddleware
  if (!authInfo) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const success = await authService.logout(authInfo.sessionId);
  
  if (success) {
    return c.json({ success: true, message: 'Logged out successfully' });
  } else {
    return c.json({ success: false, error: 'Logout failed' }, 500);
  }
}

export async function handleValidate(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>) {
  const services = c.get('services');
  const authService = services.auth;
  const authInfo = c.get('authInfo'); // authInfo is set by authMiddleware
  if (!authInfo) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return c.json({ valid: true, userId: authInfo.userId });
}

export async function handlePollTokens(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>) {
  const services = c.get('services');
  const userService = services.user;
  const sessionId = c.req.query('sessionId');

  if (!sessionId) {
    return c.json({ error: 'Session ID is required' }, 400);
  }

  const tokens = await userService.getSessionTokens(sessionId);

  if (tokens) {
    return c.json({ success: true, ...tokens });
  } else {
    return c.json({ success: false, message: 'Tokens not ready or session expired.' }, 202); // 202 Accepted for polling
  }
}

// createAuthRoutes is no longer needed as routes are handled directly in index.ts
// export function createAuthRoutes(authService: AuthService) {
//   const app = new Hono<{ Bindings: Env }>();
//   // ... existing routes ...
//   return app;
// }