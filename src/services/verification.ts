import { VerificationToken, RefreshToken } from '../types';
import { generateRandomId, generateSecureToken, hashToken } from '../utils/crypto';

export class VerificationService {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async createVerificationToken(phoneNumber: string): Promise<{ token: string; tokenId: string }> {
    const now = Math.floor(Date.now() / 1000);
    const tokenId = generateRandomId();
    const plainToken = generateSecureToken(32);
    const tokenHash = await hashToken(plainToken);
    const expiresAt = now + (10 * 60); // 10 minutes

    await this.db
      .prepare('INSERT INTO verification_tokens (id, token_hash, phone_number, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(tokenId, tokenHash, phoneNumber, expiresAt, now)
      .run();

    return { token: plainToken, tokenId };
  }

  async validateAndConsumeToken(plainToken: string, phoneNumber: string): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const tokenHash = await hashToken(plainToken);

    // Find the token record
    const tokenRecord = await this.db
      .prepare('SELECT * FROM verification_tokens WHERE token_hash = ? AND phone_number = ? AND expires_at > ? AND used_at IS NULL')
      .bind(tokenHash, phoneNumber, now)
      .first<VerificationToken>();

    if (!tokenRecord) {
      return false;
    }

    // Mark token as used
    await this.db
      .prepare('UPDATE verification_tokens SET used_at = ? WHERE id = ?')
      .bind(now, tokenRecord.id)
      .run();

    return true;
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