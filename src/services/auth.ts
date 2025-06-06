import { UserService } from './user';
import { WhatsAppService } from './whatsapp';
import { createJWT, verifyJWT } from '../utils/jwt';
import { CONFIG } from '../config';
import { generateRandomId } from '../utils/crypto';

interface LoginTokenPayload {
  phone: string;
  exp: number;
}

interface AuthTokenPayload {
  userId: string;
  sessionId: string;
}

export class AuthService {
  private userService: UserService;
  private whatsappService: WhatsAppService;

  constructor(userService: UserService, whatsappService: WhatsAppService) {
    this.userService = userService;
    this.whatsappService = whatsappService;
  }

  async initiateLogin(phoneNumber: string): Promise<{ success: boolean; sessionId?: string }> {
    // Format phone number to E.164 format (required by WhatsApp)
    const formattedPhone = this.formatPhoneNumber(phoneNumber);
    
    // Find or create the user first to ensure a user ID is available
    let user = await this.userService.findUserByPhone(formattedPhone);
    if (!user) {
      user = await this.userService.createUser(formattedPhone);
    }

    // Create a new session for this login attempt
    const session = await this.userService.createSession(user.id, CONFIG.JWT.EXPIRY);
    const sessionId = session.id;

    // Create a short-lived token for this login attempt including the sessionId
    const loginToken = await createJWT(
      { phone: formattedPhone, sessionId: sessionId },
      60 * 15 // 15 minutes expiry
    );
    
    const buttonText = user ? 'Confirm Login' : 'Confirm Registration';
    const bodyText = user
      ? 'Tap the button to log in to your account.'
      : 'Tap the button to confirm your registration.';

    // Send the interactive button message via WhatsApp
    try {
      await this.whatsappService.sendInteractiveButtonMessage(
        formattedPhone,
        buttonText,
        loginToken,
        bodyText
      );
      // await this.whatsappService.sendHelloWorldMessage(formattedPhone);
      return { success: true, sessionId: sessionId };
    } catch (error) {
      console.error('Failed to send WhatsApp interactive message:', error);
      return { success: false };
    }
  }

  async verifyLogin(token: string): Promise<{ authToken: string; userId: string; refreshToken: string } | null> {
    // Verify the login token
    const payload = await verifyJWT<LoginTokenPayload & { sessionId: string }>(token);
    if (!payload || !payload.phone || !payload.sessionId) {
      return null;
    }

    // Check if the session is still valid and pending
    const session = await this.userService.findSessionById(payload.sessionId);
    if (!session || session.status !== 'pending') {
      console.log(`Session ${payload.sessionId} not found or not in pending status.`);
      return null;
    }
    
    // Find or create the user
    let user = await this.userService.findUserByPhone(payload.phone);
    if (!user) {
      // This case should ideally not happen if user was created on initiateLogin
      user = await this.userService.createUser(payload.phone);
    } else {
      await this.userService.updateLastLogin(user.id);
    }
    
    // Update the existing session to 'ready' with tokens
    // (The actual session is already created in initiateLogin)
    // No need to create a new session here.

    // Create auth and refresh tokens
    const authToken = await createJWT({
      userId: user.id,
      sessionId: payload.sessionId
    });
    
    const refreshToken = await createJWT({
      userId: user.id,
      sessionId: payload.sessionId
    }, CONFIG.JWT.EXPIRY * 2);
    
    // Mark the session as ready with tokens. The frontend will pick these up.
    await this.userService.updateSessionTokens(payload.sessionId, authToken, refreshToken);

    return { authToken, userId: user.id, refreshToken };
  }

  async verifyLoginTokenOnly(token: string): Promise<(LoginTokenPayload & { sessionId: string }) | null> {
    const payload = await verifyJWT<LoginTokenPayload & { sessionId: string }>(token);
    return payload;
  }

  async validateAuthToken(token: string): Promise<{ userId: string, sessionId: string } | null> {
    const payload = await verifyJWT<AuthTokenPayload>(token);
    if (!payload || !payload.userId || !payload.sessionId) {
      return null;
    }
    
    // Verify the session exists and is valid
    const session = await this.userService.findSessionById(payload.sessionId);
    if (!session) {
      return null;
    }
    
    return { userId: payload.userId, sessionId: payload.sessionId };
  }

  async logout(sessionId: string): Promise<boolean> {
    try {
      await this.userService.deleteSession(sessionId);
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