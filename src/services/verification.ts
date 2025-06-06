import { VerificationToken, RefreshToken } from '../types';
import { generateRandomId, generateSecureToken, hashToken } from '../utils/crypto';
import { TokenPayload } from '../types';

export class VerificationService {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async createVerificationToken(phoneNumber: string, isNewUser: boolean): Promise<{ token: string; tokenId: string }> {
    console.log(`[VerificationService] Creating verification token for phone: ${phoneNumber}, isNewUser: ${isNewUser}`);
    
    const now = Math.floor(Date.now() / 1000);
    const tokenId = generateRandomId();
    const plainToken = generateSecureToken(32);
    const expiresAt = now + (10 * 60); // 10 minutes

    console.log(`[VerificationService] Generated tokenId: ${tokenId}, plainToken length: ${plainToken.length}, expiresAt: ${expiresAt}`);

    // Create structured token payload with user status
    const tokenPayload = {
      token: plainToken,
      isNewUser,
      phoneNumber,
      timestamp: now,
      expiresAt
    };

    console.log(`[VerificationService] Token payload created:`, tokenPayload);

    // Encode the payload as base64 for the button
    const encodedPayload = btoa(JSON.stringify(tokenPayload));
    const tokenHash = await hashToken(plainToken);

    console.log(`[VerificationService] Encoded payload length: ${encodedPayload.length}, tokenHash: ${tokenHash}`);

    await this.db
      .prepare('INSERT INTO verification_tokens (id, token_hash, phone_number, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(tokenId, tokenHash, phoneNumber, expiresAt, now)
      .run();

    console.log(`[VerificationService] Token saved to database successfully`);

    return { token: encodedPayload, tokenId };
  }

  async validateAndConsumeToken(encodedToken: string, phoneNumber: string): Promise<{ isValid: boolean; isNewUser?: boolean }> {
    console.log(`[VerificationService] Validating token for phone: ${phoneNumber}, token length: ${encodedToken.length}`);
    
    // Decode the token payload
    const payload = await this.decodeTokenPayload(encodedToken);
    if (!payload) {
      console.log(`[VerificationService] Failed to decode token payload`);
      return { isValid: false };
    }

    console.log(`[VerificationService] Decoded payload:`, payload);

    // Verify phone number matches
    if (payload.phoneNumber !== phoneNumber) {
      console.log(`[VerificationService] Phone number mismatch. Expected: ${phoneNumber}, Got: ${payload.phoneNumber}`);
      return { isValid: false };
    }

    const now = Math.floor(Date.now() / 1000);
    const tokenHash = await hashToken(payload.token);

    console.log(`[VerificationService] Looking for token with hash: ${tokenHash}, current time: ${now}`);

    // Find the token record
    const tokenRecord = await this.db
      .prepare('SELECT * FROM verification_tokens WHERE token_hash = ? AND phone_number = ? AND expires_at > ? AND used_at IS NULL')
      .bind(tokenHash, phoneNumber, now)
      .first<VerificationToken>();

    if (!tokenRecord) {
      console.log(`[VerificationService] Token record not found or expired/used`);
      return { isValid: false };
    }

    console.log(`[VerificationService] Found valid token record:`, tokenRecord);

    // Mark token as used
    await this.db
      .prepare('UPDATE verification_tokens SET used_at = ? WHERE id = ?')
      .bind(now, tokenRecord.id)
      .run();

    console.log(`[VerificationService] Token marked as used`);

    return { isValid: true, isNewUser: payload.isNewUser };
  }

  async decodeTokenPayload(encodedToken: string): Promise<TokenPayload | null> {
    console.log(`[VerificationService] Decoding token payload, encoded length: ${encodedToken.length}`);
    
    try {
      const decodedPayload = JSON.parse(atob(encodedToken));
      
      console.log(`[VerificationService] Raw decoded payload:`, decodedPayload);
      
      // Validate payload structure
      if (!decodedPayload.token || typeof decodedPayload.isNewUser !== 'boolean' || 
          !decodedPayload.phoneNumber || !decodedPayload.timestamp || !decodedPayload.expiresAt) {
        console.log(`[VerificationService] Invalid payload structure`);
        return null;
      }

      // Check if token has expired
      const now = Math.floor(Date.now() / 1000);
      if (decodedPayload.expiresAt <= now) {
        console.log(`[VerificationService] Token expired. ExpiresAt: ${decodedPayload.expiresAt}, Now: ${now}`);
        return null;
      }

      console.log(`[VerificationService] Token payload validation successful`);
      return decodedPayload;
    } catch (error) {
      console.error('[VerificationService] Failed to decode token payload:', error);
      return null;
    }
  }

  async getPhoneNumberFromToken(encodedToken: string): Promise<string | null> {
    console.log(`[VerificationService] Extracting phone number from token`);
    const payload = await this.decodeTokenPayload(encodedToken);
    const phoneNumber = payload ? payload.phoneNumber : null;
    console.log(`[VerificationService] Extracted phone number: ${phoneNumber}`);
    return phoneNumber;
  }

  async validateTokenOnly(encodedToken: string, phoneNumber: string): Promise<{ isValid: boolean; isNewUser?: boolean }> {
    // Decode the token payload
    const payload = await this.decodeTokenPayload(encodedToken);
    if (!payload) {
      return { isValid: false };
    }

    // Verify phone number matches
    if (payload.phoneNumber !== phoneNumber) {
      return { isValid: false };
    }

    const now = Math.floor(Date.now() / 1000);
    const tokenHash = await hashToken(payload.token);

    // Find the token record without consuming it
    const tokenRecord = await this.db
      .prepare('SELECT * FROM verification_tokens WHERE token_hash = ? AND phone_number = ? AND expires_at > ? AND used_at IS NULL')
      .bind(tokenHash, phoneNumber, now)
      .first<VerificationToken>();

    return { isValid: !!tokenRecord, isNewUser: payload.isNewUser };
  }

  async createRefreshToken(userId: string): Promise<{ token: string; tokenId: string }> {
    const now = Math.floor(Date.now() / 1000);
    const tokenId = generateRandomId();
    const plainToken = generateSecureToken(64);
    const tokenHash = await hashToken(plainToken);
    const expiresAt = now + (30 * 24 * 60 * 60); // 30 days

    await this.db
      .prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(tokenId, userId, tokenHash, expiresAt, now)
      .run();

    return { token: plainToken, tokenId };
  }

  async validateRefreshToken(plainToken: string, userId: string): Promise<RefreshToken | null> {
    const now = Math.floor(Date.now() / 1000);
    const tokenHash = await hashToken(plainToken);

    const tokenRecord = await this.db
      .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ? AND user_id = ? AND expires_at > ? AND revoked_at IS NULL')
      .bind(tokenHash, userId, now)
      .first<RefreshToken>();

    return tokenRecord || null;
  }

  async revokeRefreshToken(tokenId: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    
    await this.db
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?')
      .bind(now, tokenId)
      .run();
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    
    await this.db
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .bind(now, userId)
      .run();
  }

  async cleanupExpiredTokens(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    
    // Clean up expired verification tokens
    await this.db
      .prepare('DELETE FROM verification_tokens WHERE expires_at < ?')
      .bind(now)
      .run();

    // Clean up expired refresh tokens
    await this.db
      .prepare('DELETE FROM refresh_tokens WHERE expires_at < ?')
      .bind(now)
      .run();
  }
}