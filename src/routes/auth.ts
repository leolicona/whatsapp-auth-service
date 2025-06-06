import { Context } from 'hono';
import { AuthService } from '../services/auth';
import { phoneSchema } from '../middleware/validation';
import { authMiddleware } from '../middleware/auth';
import { Env, Variables } from '../types';
import { z } from 'zod';

export async function handleInitiate(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, authService: AuthService, phone_number: string) {

  const result = await authService.initiateLogin(phone_number);
  
  if (result.success) {
    return c.json({ status: 'Confirmation message sent.' });
  } else {
    return c.json({ error: 'Failed to send confirmation message' }, 500);
  }
}

export async function handleRefreshToken(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, authService: AuthService) {
  const { refresh_token, user_id } = await c.req.json();
  
  if (!refresh_token || !user_id) {
    return c.json({ error: 'Missing refresh_token or user_id' }, 400);
  }
  
  const result = await authService.refreshAccessToken(refresh_token, user_id);
  
  if (result) {
    return c.json({ 
      access_token: result.accessToken, 
      refresh_token: result.refreshToken 
    });
  } else {
    return c.json({ error: 'Invalid or expired refresh token' }, 401);
  }
}

export async function handleLogout(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, authService: AuthService) {
  const { user_id, refresh_token } = await c.req.json();
  
  if (!user_id) {
    return c.json({ error: 'Missing user_id' }, 400);
  }
  
  const success = await authService.logout(user_id, refresh_token);
  
  if (success) {
    return c.json({ success: true, message: 'Logged out successfully' });
  } else {
    return c.json({ success: false, error: 'Logout failed' }, 500);
  }
}

export async function handleValidate(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, authService: AuthService) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid authorization header' }, 401);
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const authInfo = await authService.validateAccessToken(token);
  
  if (!authInfo) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
  
  return c.json({ valid: true, userId: authInfo.userId });
}

// Note: handlePollTokens has been removed as the new secure flow
// delivers tokens directly via webhook processing. Client applications
// should implement real-time communication (WebSocket, SSE) or
// alternative token delivery mechanisms.
