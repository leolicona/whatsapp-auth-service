import { Hono, Context } from 'hono';
import { UserService } from '../services/user';
import { authMiddleware } from '../middleware/auth';
import { AuthService } from '../services/auth';
import { Env, Variables } from '../types';

export async function handleGetUserMe(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, userService: UserService) {
  const authInfo = c.get('authInfo');
  if (!authInfo) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
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
}

export async function handlePutUserMe(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, userService: UserService) {
  const authInfo = c.get('authInfo');
  if (!authInfo) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const { name } = await c.req.json();
  
  // Update user name
  await c.env.DB
    .prepare('UPDATE users SET name = ? WHERE id = ?')
    .bind(name, authInfo.userId)
    .run();
  
  return c.json({ success: true });
}

// createUserRoutes is no longer needed as routes are handled directly in index.ts
// export function createUserRoutes(userService: UserService, authService: AuthService) {
//   const app = new Hono<{ Bindings: Env; Variables: Variables }>();
//   // ... existing routes ...
//   return app;
// }