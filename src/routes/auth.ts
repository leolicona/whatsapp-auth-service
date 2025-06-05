import { Hono } from 'hono';
import { AuthService } from '../services/auth';
import { validatePhone, validateToken } from '../middleware/validation';
import { authMiddleware } from '../middleware/auth';
import { Env } from '../types';

export function createAuthRoutes(authService: AuthService) {
  const app = new Hono<{ Bindings: Env }>();

  // Initiate login by sending WhatsApp message
  app.post('/login', validatePhone, async (c) => {
    const { phone_number } = await c.req.json();
    const success = await authService.initiateLogin(phone_number);
    
    if (success) {
      return c.json({ success: true, message: 'Login link sent via WhatsApp' });
    } else {
      return c.json({ success: false, error: 'Failed to send login link' }, 500);
    }
  });

  // Verify login token and issue auth token
  app.post('/verify', validateToken, async (c) => {
    const { token } = await c.req.json();
    const result = await authService.verifyLogin(token);
    
    if (result) {
      return c.json({ success: true, auth_token: result.authToken });
    } else {
      return c.json({ success: false, error: 'Invalid or expired token' }, 400);
    }
  });

  // Logout (requires authentication)
  app.post('/logout', authMiddleware(authService), async (c) => {
    const authInfo = c.get('authInfo');
    const success = await authService.logout(authInfo.sessionId);
    
    if (success) {
      return c.json({ success: true, message: 'Logged out successfully' });
    } else {
      return c.json({ success: false, error: 'Logout failed' }, 500);
    }
  });

  // Validate token (for client-side validation)
  app.get('/validate', authMiddleware(authService), async (c) => {
    const authInfo = c.get('authInfo');
    return c.json({ valid: true, userId: authInfo.userId });
  });

  return app;
}