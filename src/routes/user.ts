import { Hono } from 'hono';
import { UserService } from '../services/user';
import { authMiddleware } from '../middleware/auth';
import { AuthService } from '../services/auth';
import { Env } from '../types';

export function createUserRoutes(userService: UserService, authService: AuthService) {
  const app = new Hono<{ Bindings: Env }>();

  // Apply auth middleware to all routes
  app.use('*', authMiddleware(authService));

  // Get current user profile
  app.get('/me', async (c) => {
    const authInfo = c.get('authInfo');
    const user = await userService.findUserById(authInfo.userId);
    
    if (user) {
      // Don't expose sensitive information
      return c.json({
        id: user.id,
        phone_number: user.phone_number,
        name: user.name,
        created_at: user.created_at
      });
    } else {
      return c.json({ error: 'User not found' }, 404);
    }
  });

  // Update user profile
  app.put('/me', async (c) => {
    const authInfo = c.get('authInfo');
    const { name } = await c.req.json();
    
    // Update user name
    await c.env.DB
      .prepare('UPDATE users SET name = ? WHERE id = ?')
      .bind(name, authInfo.userId)
      .run();
    
    return c.json({ success: true });
  });

  return app;
}