import { UserService } from './user';
import { WhatsAppService } from './whatsapp';
import { VerificationService } from './verification';
import { createJWT, verifyJWT } from '../utils/jwt';
import { CONFIG } from '../config';

// Interface defining the structure of JWT payload for authentication tokens
interface AuthTokenPayload {
  userId: string;
  sessionId: string;
}

/**
 * AuthService handles all authentication-related operations including:
 * - Login initiation via WhatsApp
 * - Token verification and validation
 * - JWT token generation and management
 * - User session management
 */
export class AuthService {
  private userService: UserService;
  private whatsappService: WhatsAppService;
  private verificationService: VerificationService;

  constructor(userService: UserService, whatsappService: WhatsAppService, verificationService: VerificationService) {
    this.userService = userService;
    this.whatsappService = whatsappService;
    this.verificationService = verificationService;
  }

  /**
   * Initiates the login process by sending a WhatsApp message with verification button
   * 
   * Flow:
   * 1. Format phone number to E.164 standard
   * 2. Check if user exists to determine if this is signup or login
   * 3. Generate secure verification token with user status
   * 4. Send WhatsApp interactive button message
   * 5. Return session ID for tracking
   */
  async initiateLogin(phoneNumber: string): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    console.log(`[AuthService] Initiating login for phone: ${phoneNumber}`);
    
    // Step 1: Format phone number to E.164 format (required by WhatsApp)
    const formattedPhone = this.formatPhoneNumber(phoneNumber);
    console.log(`[AuthService] Formatted phone number: ${formattedPhone}`);
    
    // Step 2: Check if user exists (but don't create yet - we'll do that after verification)
    const existingUser = await this.userService.findUserByPhone(formattedPhone);
    const isNewUser = !existingUser;
    
    console.log(`[AuthService] User lookup result - isNewUser: ${isNewUser}, existingUser:`, existingUser);
    
    // Step 3: Generate secure verification token that includes user status (new/existing)
    // This token will be embedded in the WhatsApp button and used for verification
    const { token: encodedToken, tokenId } = await this.verificationService.createVerificationToken(formattedPhone, isNewUser);
    
    console.log(`[AuthService] Generated encoded token length: ${encodedToken.length}`);
    
    // Step 4: Customize message content based on whether this is signup or login
    const buttonText = isNewUser ? 'Sign Up' : 'Confirm Login';
    const bodyText = isNewUser
      ? 'Hello!\n\nWe\'ve received a request to create a new account with this phone number.\n\nPlease press the button below in the next 10 minutes to confirm. If you haven\'t made this request, you can safely ignore this message.'
      : 'Welcome back!\n\nTap the button below to log in to your account. This link will expire in 10 minutes.';

    console.log(`[AuthService] Message content - buttonText: ${buttonText}, bodyText length: ${bodyText.length}`);

    // Step 5: Send the interactive button message via WhatsApp
    // The encoded token is embedded as the button payload
    try {
      console.log(`[AuthService] Sending WhatsApp message to: ${formattedPhone}`);
      
      await this.whatsappService.sendInteractiveButtonMessage(
        formattedPhone,
        buttonText,
        encodedToken, // Use encoded token as button payload
        bodyText
      );
      
      console.log(`[AuthService] WhatsApp message sent successfully`);
      return { success: true, sessionId: tokenId };
    } catch (error) {
      console.error('[AuthService] Failed to send WhatsApp interactive message:', error);
      return { success: false, error: 'Failed to send WhatsApp message' };
    }
  }

  /**
   * Verifies the webhook token and completes the authentication process
   * 
   * Flow:
   * 1. Validate and consume the verification token
   * 2. Handle user creation or login based on token status
   * 3. Generate JWT access and refresh tokens
   * 4. Return authentication tokens
   */
  async verifyWebhookToken(phoneNumber: string, encodedToken: string): Promise<{ accessToken: string; refreshToken: string; userId: string } | null> {
    console.log(`[AuthService] Verifying webhook token for phone: ${phoneNumber}, token length: ${encodedToken.length}`);
    
    // Step 1: Validate and consume the verification token
    // This ensures the token is valid, not expired, and hasn't been used before
    const tokenValidation = await this.verificationService.validateAndConsumeToken(encodedToken, phoneNumber);
    if (!tokenValidation.isValid) {
      console.log(`[AuthService] Token validation failed`);
      return null;
    }

    console.log(`[AuthService] Token validation successful, isNewUser: ${tokenValidation.isNewUser}`);

    // Step 2: Handle user creation or existing user login based on token status
    let user;
    if (tokenValidation.isNewUser) {
      // Create new user (we know from token this is a new user)
      console.log(`[AuthService] Creating new user for phone: ${phoneNumber}`);
      user = await this.userService.createUser(phoneNumber);
      console.log(`[AuthService] New user created: ${user.id} for phone: ${phoneNumber}`);
    } else {
      // Retrieve existing user and update last login timestamp
      console.log(`[AuthService] Looking up existing user for phone: ${phoneNumber}`);
      user = await this.userService.findUserByPhone(phoneNumber);
      if (!user) {
        // Fallback: user might have been deleted between token creation and verification
        console.warn(`[AuthService] User not found during login, creating new user for phone: ${phoneNumber}`);
        user = await this.userService.createUser(phoneNumber);
      } else {
        console.log(`[AuthService] Updating last login for user: ${user.id}`);
        await this.userService.updateLastLogin(user.id);
        console.log(`[AuthService] Existing user logged in: ${user.id} for phone: ${phoneNumber}`);
      }
    }

    console.log(`[AuthService] Generating JWT tokens for user: ${user.id}`);

    // Step 3: Generate JWT access token (short-lived for security)
    const accessToken = await createJWT({
      userId: user.id,
      type: 'access'
    }, 15 * 60); // 15 minutes expiration

    // Step 4: Generate and store refresh token (long-lived for convenience)
    const { token: refreshToken } = await this.verificationService.createRefreshToken(user.id);

    console.log(`[AuthService] Tokens generated successfully - accessToken length: ${accessToken.length}, refreshToken length: ${refreshToken.length}`);

    return { accessToken, refreshToken, userId: user.id };
  }

  /**
   * Validates an access token and returns user information
   * 
   * Flow:
   * 1. Verify JWT signature and decode payload
   * 2. Check token type and extract user ID
   * 3. Verify user still exists in database
   * 4. Return user ID if valid
   */
  async validateAccessToken(token: string): Promise<{ userId: string } | null> {
    // Step 1: Verify JWT signature and decode payload
    const payload = await verifyJWT<{ userId: string; type: string }>(token);
    if (!payload || !payload.userId || payload.type !== 'access') {
      return null;
    }
    
    // Step 2: Verify the user still exists (user might have been deleted)
    const user = await this.userService.findUserById(payload.userId);
    if (!user) {
      return null;
    }
    
    return { userId: payload.userId };
  }

  /**
   * Refreshes an access token using a valid refresh token
   * 
   * Flow:
   * 1. Validate the refresh token
   * 2. Generate new access token
   * 3. Rotate refresh token (generate new one and revoke old)
   * 4. Return new token pair
   */
  async refreshAccessToken(refreshToken: string, userId: string): Promise<{ accessToken: string; refreshToken: string } | null> {
    // Step 1: Validate the refresh token against database
    const tokenRecord = await this.verificationService.validateRefreshToken(refreshToken, userId);
    if (!tokenRecord) {
      return null;
    }

    // Step 2: Generate new access token with fresh expiration
    const accessToken = await createJWT({
      userId: userId,
      type: 'access'
    }, 15 * 60); // 15 minutes

    // Step 3: Implement token rotation for security
    // Revoke the old refresh token and generate a new one
    await this.verificationService.revokeRefreshToken(tokenRecord.id);
    const { token: newRefreshToken } = await this.verificationService.createRefreshToken(userId);

    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Logs out a user by revoking refresh tokens
   * 
   * Flow:
   * 1. If specific refresh token provided, revoke only that token
   * 2. If no token provided, revoke all user's refresh tokens (logout from all devices)
   * 3. Return success status
   */
  async logout(userId: string, refreshToken?: string): Promise<boolean> {
    try {
      if (refreshToken) {
        // Step 1: Revoke the specific refresh token (logout from current device)
        const tokenRecord = await this.verificationService.validateRefreshToken(refreshToken, userId);
        if (tokenRecord) {
          await this.verificationService.revokeRefreshToken(tokenRecord.id);
        }
      } else {
        // Step 2: Revoke all refresh tokens for the user (logout from all devices)
        await this.verificationService.revokeAllUserRefreshTokens(userId);
      }
      return true;
    } catch (error) {
      console.error('Logout failed:', error);
      return false;
    }
  }

  /**
   * Verifies login token and completes full authentication process
   * 
   * Flow:
   * 1. Extract phone number from token
   * 2. Verify webhook token and get authentication tokens
   * 3. Return formatted response with auth tokens
   */
  async verifyLogin(token: string): Promise<{ authToken: string; refreshToken: string; userId: string } | null> {
    console.log(`[AuthService] Verifying login with token length: ${token.length}`);
    
    // Step 1: Extract phone number from token without consuming it
    const phoneNumber = await this.verificationService.getPhoneNumberFromToken(token);
    if (!phoneNumber) {
      console.log(`[AuthService] Failed to extract phone number from token`);
      return null;
    }

    console.log(`[AuthService] Extracted phone number: ${phoneNumber}`);

    // Step 2: Verify webhook token and complete authentication
    const result = await this.verifyWebhookToken(phoneNumber, token);
    if (result) {
      console.log(`[AuthService] Login verification successful for user: ${result.userId}`);
      return {
        authToken: result.accessToken,
        refreshToken: result.refreshToken,
        userId: result.userId
      };
    }
    
    console.log(`[AuthService] Login verification failed`);
    return null;
  }

  /**
   * Verifies login token WITHOUT consuming it (for extracting information only)
   * 
   * Flow:
   * 1. Extract phone number from token
   * 2. Validate token without marking it as used
   * 3. Return token information for further processing
   * 
   * Note: This method is used when you need token information but want to
   * consume the token later with a different method
   */
  async verifyLoginTokenOnly(token: string): Promise<{ phoneNumber: string; isNewUser: boolean; sessionId?: string } | null> {
    console.log(`[AuthService] Verifying login token only, token length: ${token.length}`);
    
    // Step 1: Extract phone number from token without consuming it
    const phoneNumber = await this.verificationService.getPhoneNumberFromToken(token);
    if (!phoneNumber) {
      console.log(`[AuthService] Failed to extract phone number from token`);
      return null;
    }

    console.log(`[AuthService] Extracted phone number: ${phoneNumber}`);

    // Step 2: Validate token without consuming it (read-only validation)
    const tokenValidation = await this.verificationService.validateTokenOnly(token, phoneNumber);
    if (!tokenValidation.isValid) {
      console.log(`[AuthService] Token validation failed`);
      return null;
    }

    console.log(`[AuthService] Token validation successful, isNewUser: ${tokenValidation.isNewUser}`);
    console.log(`[AuthService] Token sessionId: ${tokenValidation.sessionId}`);
    // Step 3: Return token information for further processing
    return {
      phoneNumber,
      isNewUser: tokenValidation.isNewUser || false,
      sessionId: tokenValidation.sessionId
    };
  }

  // Getter methods for accessing injected services
  getUserService(): UserService {
    return this.userService;
  }

  getWhatsappService(): WhatsAppService {
    return this.whatsappService;
  }

  /**
   * Formats phone number to E.164 international format
   * 
   * Flow:
   * 1. Remove all non-digit characters
   * 2. Add '+' prefix if not present
   * 3. Return formatted number
   */
  private formatPhoneNumber(phone: string): string {
    // Step 1: Remove any non-digit characters (spaces, dashes, parentheses, etc.)
    const digits = phone.replace(/\D/g, '');
    
    // Step 2: Ensure the number starts with a '+' for E.164 format
    return digits.startsWith('+')
      ? digits
      : `+${digits}`;
  }
}