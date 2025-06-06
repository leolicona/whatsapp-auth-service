import { UserService } from './user';
import { WhatsAppService } from './whatsapp';
import { VerificationService } from './verification';
import { createJWT, verifyJWT } from '../utils/jwt';
import { CONFIG } from '../config';

interface AuthTokenPayload {
  userId: string;
  sessionId: string;
}

export class AuthService {
  private userService: UserService;
  private whatsappService: WhatsAppService;
  private verificationService: VerificationService;

  constructor(userService: UserService, whatsappService: WhatsAppService, verificationService: VerificationService) {
    this.userService = userService;
    this.whatsappService = whatsappService;
    this.verificationService = verificationService;
  }

  async initiateLogin(phoneNumber: string): Promise<{ success: boolean }> {
    console.log(`[AuthService] Initiating login for phone: ${phoneNumber}`);
    
    // Format phone number to E.164 format (required by WhatsApp)
    const formattedPhone = this.formatPhoneNumber(phoneNumber);
    console.log(`[AuthService] Formatted phone number: ${formattedPhone}`);
    
    // Check if user exists (but don't create yet)
    const existingUser = await this.userService.findUserByPhone(formattedPhone);
    const isNewUser = !existingUser;
    
    console.log(`[AuthService] User lookup result - isNewUser: ${isNewUser}, existingUser:`, existingUser);
    
    // Generate secure verification token with user status
    const { token: encodedToken } = await this.verificationService.createVerificationToken(formattedPhone, isNewUser);
    
    console.log(`[AuthService] Generated encoded token length: ${encodedToken.length}`);
    
    // Select message content based on user existence
    const buttonText = isNewUser ? 'Sign Up' : 'Confirm Login';
    const bodyText = isNewUser
      ? 'Hello!\n\nWe\'ve received a request to create a new account with this phone number.\n\nPlease press the button below in the next 10 minutes to confirm. If you haven\'t made this request, you can safely ignore this message.'
      : 'Welcome back!\n\nTap the button below to log in to your account. This link will expire in 10 minutes.';

    console.log(`[AuthService] Message content - buttonText: ${buttonText}, bodyText length: ${bodyText.length}`);

    // Send the interactive button message via WhatsApp with encoded token
    try {
      console.log(`[AuthService] Sending WhatsApp message to: ${formattedPhone}`);
      
      await this.whatsappService.sendInteractiveButtonMessage(
        formattedPhone,
        buttonText,
        encodedToken, // Use encoded token as button payload
        bodyText
      );
      
      console.log(`[AuthService] WhatsApp message sent successfully`);
      return { success: true };
    } catch (error) {
      console.error('[AuthService] Failed to send WhatsApp interactive message:', error);
      return { success: false };
    }
  }

  async verifyWebhookToken(phoneNumber: string, encodedToken: string): Promise<{ accessToken: string; refreshToken: string; userId: string } | null> {
    console.log(`[AuthService] Verifying webhook token for phone: ${phoneNumber}, token length: ${encodedToken.length}`);
    
    // Validate and consume the verification token
    const tokenValidation = await this.verificationService.validateAndConsumeToken(encodedToken, phoneNumber);
    if (!tokenValidation.isValid) {
      console.log(`[AuthService] Token validation failed`);
      return null;
    }

    console.log(`[AuthService] Token validation successful, isNewUser: ${tokenValidation.isNewUser}`);

    // Use the user status from the token to optimize user handling
    let user;
    if (tokenValidation.isNewUser) {
      // Create new user (we know from token this is a new user)
      console.log(`[AuthService] Creating new user for phone: ${phoneNumber}`);
      user = await this.userService.createUser(phoneNumber);
      console.log(`[AuthService] New user created: ${user.id} for phone: ${phoneNumber}`);
    } else {
      // Retrieve existing user and update last login
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

    // Generate JWT access token (short-lived)
    const accessToken = await createJWT({
      userId: user.id,
      type: 'access'
    }, 15 * 60); // 15 minutes

    // Generate and store refresh token (long-lived)
    const { token: refreshToken } = await this.verificationService.createRefreshToken(user.id);

    console.log(`[AuthService] Tokens generated successfully - accessToken length: ${accessToken.length}, refreshToken length: ${refreshToken.length}`);

    return { accessToken, refreshToken, userId: user.id };
  }

  async validateAccessToken(token: string): Promise<{ userId: string } | null> {
    const payload = await verifyJWT<{ userId: string; type: string }>(token);
    if (!payload || !payload.userId || payload.type !== 'access') {
      return null;
    }
    
    // Verify the user still exists
    const user = await this.userService.findUserById(payload.userId);
    if (!user) {
      return null;
    }
    
    return { userId: payload.userId };
  }

  async refreshAccessToken(refreshToken: string, userId: string): Promise<{ accessToken: string; refreshToken: string } | null> {
    // Validate the refresh token
    const tokenRecord = await this.verificationService.validateRefreshToken(refreshToken, userId);
    if (!tokenRecord) {
      return null;
    }

    // Generate new access token
    const accessToken = await createJWT({
      userId: userId,
      type: 'access'
    }, 15 * 60); // 15 minutes

    // Generate new refresh token (token rotation)
    await this.verificationService.revokeRefreshToken(tokenRecord.id);
    const { token: newRefreshToken } = await this.verificationService.createRefreshToken(userId);

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(userId: string, refreshToken?: string): Promise<boolean> {
    try {
      if (refreshToken) {
        // Revoke the specific refresh token
        const tokenRecord = await this.verificationService.validateRefreshToken(refreshToken, userId);
        if (tokenRecord) {
          await this.verificationService.revokeRefreshToken(tokenRecord.id);
        }
      } else {
        // Revoke all refresh tokens for the user (logout from all devices)
        await this.verificationService.revokeAllUserRefreshTokens(userId);
      }
      return true;
    } catch (error) {
      console.error('Logout failed:', error);
      return false;
    }
  }

  async verifyLogin(token: string): Promise<{ authToken: string; refreshToken: string; userId: string } | null> {
    console.log(`[AuthService] Verifying login with token length: ${token.length}`);
    
    // Extract phone number from token
    const phoneNumber = await this.verificationService.getPhoneNumberFromToken(token);
    if (!phoneNumber) {
      console.log(`[AuthService] Failed to extract phone number from token`);
      return null;
    }

    console.log(`[AuthService] Extracted phone number: ${phoneNumber}`);

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

  async verifyLoginTokenOnly(token: string): Promise<{ phoneNumber: string; isNewUser: boolean; sessionId?: string } | null> {
    console.log(`[AuthService] Verifying login token only, token length: ${token.length}`);
    
    // Extract phone number from token without consuming it
    const phoneNumber = await this.verificationService.getPhoneNumberFromToken(token);
    if (!phoneNumber) {
      console.log(`[AuthService] Failed to extract phone number from token`);
      return null;
    }

    console.log(`[AuthService] Extracted phone number: ${phoneNumber}`);

    // Validate token without consuming it
    const tokenValidation = await this.verificationService.validateTokenOnly(token, phoneNumber);
    if (!tokenValidation.isValid) {
      console.log(`[AuthService] Token validation failed`);
      return null;
    }

    console.log(`[AuthService] Token validation successful, isNewUser: ${tokenValidation.isNewUser}`);

    return {
      phoneNumber,
      isNewUser: tokenValidation.isNewUser || false
    };
  }

  getUserService(): UserService {
    return this.userService;
  }

  getWhatsappService(): WhatsAppService {
    return this.whatsappService;
  }

  private formatPhoneNumber(phone: string): string {
    // Remove any non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Ensure the number starts with a '+'
    return digits.startsWith('+')
      ? digits
      : `+${digits}`;
  }
}