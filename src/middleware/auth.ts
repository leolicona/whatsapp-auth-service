import { Context, Next } from 'hono';
import { Env, AuthInfo, Variables } from '../types';

export async function authMiddleware(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, next: Next) {
  const services = c.get('services');
  const authService = services.auth;

  // Step 1: Extract the Authorization header from the request
  const authHeader = c.req.header('Authorization');
  
  // Step 2: Validate that the Authorization header exists and has the correct format
  // Expected format: "Bearer <jwt_token>"
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
  
  // Step 3: Extract the JWT token by removing the 'Bearer ' prefix (7 characters)
  const token = authHeader.substring(7);
  
  // Step 4: Validate the access token using the correct method
  // This will:
  // - Verify the JWT signature using the secret key
  // - Check if the token has expired
  // - Extract user information from the token payload
  const authInfo = await authService.validateAccessToken(token);
  
  // Step 5: Check if token validation was successful
  if (!authInfo) {
    // Step 6a: Return error if token is invalid or expired
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
  
  // Step 6b: Add auth info to the context for use in route handlers
  // Convert the validateAccessToken result to AuthInfo format
  const authInfoForContext: AuthInfo = {
    userId: authInfo.userId,
    sessionId: '' // validateAccessToken doesn't return sessionId, but we can leave it empty for middleware
  };
  
  c.set('authInfo', authInfoForContext);
  
  await next();
};