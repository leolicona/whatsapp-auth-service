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

  async initiateLogin(phoneNumber: string): Promise<boolean> {
    // Format phone number to E.164 format (required by WhatsApp)
    const formattedPhone = this.formatPhoneNumber(phoneNumber);
    
    // Create a short-lived token for this login attempt
    const loginToken = await createJWT(
      { phone: formattedPhone },
      60 * 15 // 15 minutes expiry
    );
    
    // Send the login link via WhatsApp
    try {
      await this.whatsappService.sendLoginLink(formattedPhone, loginToken);
      return true;
    } catch (error) {
      console.error('Failed to send WhatsApp login message:', error);
      return false;
    }
  }

  async verifyLogin(token: string): Promise<{ authToken: string } | null> {
    // Verify the login token
    const payload = await verifyJWT<LoginTokenPayload>(token);
    if (!payload || !payload.phone) {
      return null;
    }
    
    // Find or create the user
    let user = await this.userService.findUserByPhone(payload.phone);
    if (!user) {
      user = await this.userService.createUser(payload.phone);
    } else {
      await this.userService.updateLastLogin(user.id);
    }
    
    // Create a session
    const session = await this.userService.createSession(user.id, CONFIG.JWT.EXPIRY);
    
    // Create an auth token
    const authToken = await createJWT({
      userId: user.id,
      sessionId: session.id
    });
    
    return { authToken };
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

  private formatPhoneNumber(phone: string): string {
    // Remove any non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Ensure the number starts with a '+'
    return digits.startsWith('+')
      ? digits
      : `+${digits}`;
  }
}