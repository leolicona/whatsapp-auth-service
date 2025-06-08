// Import necessary types and services for handling authentication routes
import { Context } from 'hono';
import { AuthService } from '../services/auth';
import { Env, Variables } from '../types';

/**
 * Handles the authentication initiation process
 * This function starts the login flow by sending a WhatsApp message with a login button
 * 
 * @param c - Hono context object containing request/response and environment bindings
 * @param authService - Service instance for handling authentication operations
 * @param phone_number - The user's phone number to send the login message to
 * @returns JSON response with success/error status and sessionId if successful
 */
export async function handleInitiate(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, authService: AuthService, phone_number: string) {

  // Step 1: Call the auth service to initiate the login process
  // This will:
  // - Generate a unique sessionId for this login attempt
  // - Create a verification token with the sessionId embedded
  // - Send a WhatsApp message with an interactive button containing the token
  const result = await authService.initiateLogin(phone_number);
  
  // Step 2: Check if the initiation was successful
  if (result.success) {
    // Step 3a: Return success response with the sessionId
    // The client will use this sessionId to establish a WebSocket connection
    // and wait for the authentication tokens to be delivered
    return c.json({
      status: 'success',
      statusCode: 200,
      message: 'Confirmation message sent successfully',
      data: {
        sessionId: result.sessionId // This sessionId is used for WebSocket connection
      }
    });
  } else {
    // Step 3b: Return error response if message sending failed
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

/**
 * Handles token refresh requests
 * This function allows clients to get new access tokens using their refresh token
 * 
 * @param c - Hono context object containing the request with refresh token data
 * @param authService - Service instance for handling authentication operations
 * @returns JSON response with new tokens or error if refresh fails
 */
export async function handleRefreshToken(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, authService: AuthService) {
  // Step 1: Extract refresh token and user ID from the request body
  const { refresh_token, user_id } = await c.req.json();
  
  // Step 2: Validate that both required parameters are present
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
  
  // Step 3: Attempt to refresh the access token
  // This will:
  // - Validate the refresh token against the database
  // - Check if the token belongs to the specified user
  // - Generate new access and refresh tokens if valid
  // - Update the refresh token in the database
  const result = await authService.refreshAccessToken(refresh_token, user_id);
  
  // Step 4: Check if token refresh was successful
  if (result) {
    // Step 5a: Return new tokens to the client
    return c.json({
      status: 'success',
      statusCode: 200,
      message: 'Tokens refreshed successfully',
      data: {
        accessToken: result.accessToken,   // New JWT access token for API calls
        refreshToken: result.refreshToken  // New refresh token for future refreshes
      }
    });
  } else {
    // Step 5b: Return error if refresh token is invalid or expired
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

/**
 * Handles user logout requests
 * This function invalidates the user's refresh token and cleans up their session
 * 
 * @param c - Hono context object containing the request with logout data
 * @param authService - Service instance for handling authentication operations
 * @returns JSON response confirming logout success or failure
 */
export async function handleLogout(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, authService: AuthService) {
  // Step 1: Extract user ID and refresh token from the request body
  const { user_id, refresh_token } = await c.req.json();
  
  // Step 2: Validate that the required user_id parameter is present
  // Note: refresh_token is optional - if not provided, all user sessions will be invalidated
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
  
  // Step 3: Perform the logout operation
  // This will:
  // - Invalidate the specific refresh token (if provided)
  // - Or invalidate all refresh tokens for the user (if no token provided)
  // - Clean up any active sessions in the database
  const success = await authService.logout(user_id, refresh_token);
  
  // Step 4: Check if logout was successful
  if (success) {
    // Step 5a: Return success confirmation
    return c.json({
      status: 'success',
      statusCode: 200,
      message: 'Logged out successfully',
      data: {
        success: true
      }
    });
  } else {
    // Step 5b: Return error if logout operation failed
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

/**
 * Handles access token validation requests
 * This function verifies if a provided JWT access token is valid and not expired
 * 
 * @param c - Hono context object containing the request with Authorization header
 * @param authService - Service instance for handling authentication operations
 * @returns JSON response with validation result and user info if valid
 */
export async function handleValidate(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, authService: AuthService) {
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
  
  // Step 4: Validate the access token
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
  
  // Step 6b: Return success with user information if token is valid
  return c.json({
    status: 'success',
    statusCode: 200,
    message: 'Token validated successfully',
    data: {
      valid: true,
      userId: authInfo.userId // User ID extracted from the valid token
    }
  });
}

/**
 * AUTHENTICATION FLOW OVERVIEW:
 * 
 * 1. CLIENT INITIATES LOGIN:
 *    - Client calls handleInitiate() with phone number
 *    - Server generates sessionId and sends WhatsApp message with login button
 *    - Client receives sessionId and establishes WebSocket connection
 * 
 * 2. USER CLICKS WHATSAPP BUTTON:
 *    - WhatsApp sends webhook to server with button payload (contains verification token)
 *    - Server extracts sessionId from token and sends auth tokens via WebSocket
 *    - Client receives tokens through WebSocket connection
 * 
 * 3. CLIENT USES TOKENS:
 *    - Client uses access token for API calls (validated via handleValidate)
 *    - Client refreshes tokens when needed (via handleRefreshToken)
 *    - Client logs out when done (via handleLogout)
 * 
 * Note: handlePollTokens has been removed as the new secure flow
 * delivers tokens directly via webhook processing and WebSocket communication.
 * This eliminates the need for polling and provides real-time token delivery.
 */
