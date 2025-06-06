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
    // Format phone number to E.164 format (required by WhatsApp)
    const formattedPhone = this.formatPhoneNumber(phoneNumber);
    
    // Check if user exists (but don't create yet)
    const existingUser = await this.userService.findUserByPhone(formattedPhone);
    const isNewUser = !existingUser;
    
    // Generate secure verification token
    const { token: plainToken } = await this.verificationService.createVerificationToken(formattedPhone);
    
    // Select message content based on user existence
    const buttonText = isNewUser ? 'Sign Up' : 'Confirm Login';
    const bodyText = isNewUser
      ? 'Hello!\n\nWe\'ve received a request to create a new account with this phone number.\n\nPlease press the button below in the next 10 minutes to confirm. If you haven\'t made this request, you can safely ignore this message.'
      : 'Welcome back!\n\nTap the button below to log in to your account. This link will expire in 10 minutes.';

    // Send the interactive button message via WhatsApp with plain-text token
    try {
      await this.whatsappService.sendInteractiveButtonMessage(
        formattedPhone,
        buttonText,
        plainToken, // Use plain-text token as button payload
        bodyText
      );
      return { success: true };
    } catch (error) {
      console.error('Failed to send WhatsApp interactive message:', error);
      return { success: false };
    }
  }

  async verifyWebhookToken(phoneNumber: string, plainToken: string): Promise<{ accessToken: string; refreshToken: string; userId: string } | null> {
    // Validate and consume the verification token
    const isValidToken = await this.verificationService.validateAndConsumeToken(plainToken, phoneNumber);
    if (!isValidToken) {
      return null;
    }

    // Create or retrieve user record
    let user = await this.userService.findUserByPhone(phoneNumber);
    if (!user) {
      // Create new user
      user = await this.userService.createUser(phoneNumber);
    } else {
      // Update last login for existing user
      await this.userService.updateLastLogin(user.id);
    }

    // Generate JWT access token (short-lived)
    const accessToken = await createJWT({
      userId: user.id,
      type: 'access'
    }, 15 * 60); // 15 minutes

    // Generate and store refresh token (long-lived)
    const { token: refreshToken } = await this.verificationService.createRefreshToken(user.id);

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