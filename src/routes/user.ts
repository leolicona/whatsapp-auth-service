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
    return c.json({
      status: 'error',
      statusCode: 401,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        details: 'Valid authentication token is required to access this resource'
      }
    }, 401);
  }
  const user = await userService.findUserById(authInfo.userId);
  
  if (user) {
    // Don't expose sensitive information
    return c.json({
      status: 'success',
      statusCode: 200,
      message: 'User retrieved successfully',
      data: {
        id: user.id,
        phoneNumber: user.phone_number,
        name: user.name,
        createdAt: user.created_at
      }
    });
  } else {
    return c.json({
      status: 'error',
      statusCode: 404,
      error: {
        code: 'USER_NOT_FOUND',
        message: 'The requested user could not be found',
        details: 'No user exists with the provided ID'
      }
    }, 404);
  }
}

export async function handlePutUserMe(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, userService: UserService) {
  const authInfo = c.get('authInfo');
  if (!authInfo) {
    return c.json({
      status: 'error',
      statusCode: 401,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        details: 'Valid authentication token is required to access this resource'
      }
    }, 401);
  }
  
  try {
    const { name } = await c.req.json();
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return c.json({
        status: 'error',
        statusCode: 400,
        error: {
          code: 'INVALID_NAME',
          message: 'Invalid name provided',
          details: 'Name must be a non-empty string'
        }
      }, 400);
    }
    
    // Update user name
    await c.env.DB
      .prepare('UPDATE users SET name = ? WHERE id = ?')
      .bind(name.trim(), authInfo.userId)
      .run();
    
    return c.json({
      status: 'success',
      statusCode: 200,
      message: 'User updated successfully',
      data: {
        success: true,
        name: name.trim()
      }
    });
  } catch (error) {
    return c.json({
      status: 'error',
      statusCode: 500,
      error: {
        code: 'UPDATE_FAILED',
        message: 'Failed to update user',
        details: 'An error occurred while updating user information'
      }
    }, 500);
  }
}

// createUserRoutes is no longer needed as routes are handled directly in index.ts
// export function createUserRoutes(userService: UserService, authService: AuthService) {
//   const app = new Hono<{ Bindings: Env; Variables: Variables }>();
//   // ... existing routes ...
//   return app;
// }