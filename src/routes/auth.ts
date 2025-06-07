import { Context } from 'hono';
import { AuthService } from '../services/auth';
import { Env, Variables } from '../types';

export async function handleInitiate(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, authService: AuthService, phone_number: string) {

  const result = await authService.initiateLogin(phone_number);
  
  if (result.success) {
    return c.json({
      status: 'success',
      statusCode: 200,
      message: 'Confirmation message sent successfully',
      data: {
        sessionId: result.sessionId
      }
    });
  } else {
    return c.json({
      status: 'error',
      statusCode: 500,
      error: {
        code: 'MESSAGE_SEND_FAILED',
        message: 'Failed to send confirmation message',
        details: result.error || 'Unknown error occurred'
      }
    }, 500);
  }
}

export async function handleRefreshToken(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, authService: AuthService) {
  const { refresh_token, user_id } = await c.req.json();
  
  if (!refresh_token || !user_id) {
    return c.json({
      status: 'error',
      statusCode: 400,
      error: {
        code: 'MISSING_PARAMETERS',
        message: 'Missing required parameters',
        details: 'Both refresh_token and user_id are required'
      }
    }, 400);
  }
  
  const result = await authService.refreshAccessToken(refresh_token, user_id);
  
  if (result) {
    return c.json({
      status: 'success',
      statusCode: 200,
      message: 'Tokens refreshed successfully',
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      }
    });
  } else {
    return c.json({
      status: 'error',
      statusCode: 401,
      error: {
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token',
        details: 'The provided refresh token is not valid or has expired'
      }
    }, 401);
  }
}

export async function handleLogout(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, authService: AuthService) {
  const { user_id, refresh_token } = await c.req.json();
  
  if (!user_id) {
    return c.json({
      status: 'error',
      statusCode: 400,
      error: {
        code: 'MISSING_USER_ID',
        message: 'Missing required parameter',
        details: 'user_id is required for logout'
      }
    }, 400);
  }
  
  const success = await authService.logout(user_id, refresh_token);
  
  if (success) {
    return c.json({
      status: 'success',
      statusCode: 200,
      message: 'Logged out successfully',
      data: {
        success: true
      }
    });
  } else {
    return c.json({
      status: 'error',
      statusCode: 500,
      error: {
        code: 'LOGOUT_FAILED',
        message: 'Logout operation failed',
        details: 'Unable to complete logout process'
      }
    }, 500);
  }
}

export async function handleValidate(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, authService: AuthService) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({
      status: 'error',
      statusCode: 401,
      error: {
        code: 'MISSING_AUTHORIZATION',
        message: 'Missing or invalid authorization header',
        details: 'Authorization header with Bearer token is required'
      }
    }, 401);
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const authInfo = await authService.validateAccessToken(token);
  
  if (!authInfo) {
    return c.json({
      status: 'error',
      statusCode: 401,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
        details: 'The provided access token is not valid or has expired'
      }
    }, 401);
  }
  
  return c.json({
    status: 'success',
    statusCode: 200,
    message: 'Token validated successfully',
    data: {
      valid: true,
      userId: authInfo.userId
    }
  });
}

// Note: handlePollTokens has been removed as the new secure flow
// delivers tokens directly via webhook processing. Client applications
// should implement real-time communication (WebSocket, SSE) or
// alternative token delivery mechanisms.
