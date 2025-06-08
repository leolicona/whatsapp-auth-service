import { VerificationToken, RefreshToken } from '../types';
import { generateRandomId, generateSecureToken, hashToken } from '../utils/crypto';
import { TokenPayload } from '../types';

/**
 * VerificationService handles all token-related operations including:
 * - Creating and managing verification tokens for WhatsApp authentication
 * - Validating and consuming tokens securely
 * - Managing refresh tokens for session persistence
 * - Token cleanup and expiration handling
 */
export class VerificationService {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Creates a verification token for WhatsApp authentication
   * 
   * Flow:
   * 1. Generate unique token ID and secure random token
   * 2. Create structured payload with user status and metadata
   * 3. Encode payload as base64 for WhatsApp button
   * 4. Hash the token for secure database storage
   * 5. Store token record in database
   * 6. Return encoded token for WhatsApp and token ID for tracking
   */
  async createVerificationToken(phoneNumber: string, isNewUser: boolean): Promise<{ token: string; tokenId: string }> {
    console.log(`[VerificationService] Creating verification token for phone: ${phoneNumber}, isNewUser: ${isNewUser}`);
    
    // Step 1: Generate unique identifiers and set expiration
    const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
    const tokenId = generateRandomId(); // Unique identifier for database record
    const plainToken = generateSecureToken(32); // Cryptographically secure random token
    const expiresAt = now + (10 * 60); // 10 minutes from now

    console.log(`[VerificationService] Generated tokenId: ${tokenId}, plainToken length: ${plainToken.length}, expiresAt: ${expiresAt}`);

    // Step 2: Create structured token payload with all necessary information
    // This payload will be embedded in the WhatsApp button and decoded later
    const tokenPayload = {
      token: plainToken, // The actual verification token
      isNewUser, // Whether this is a signup or login attempt
      phoneNumber, // Phone number for validation
      timestamp: now, // When the token was created
      expiresAt, // When the token expires
      sessionId: tokenId // Include tokenId as sessionId for WebSocket connection
    };

    console.log(`[VerificationService] Token payload created:`, tokenPayload);

    // Step 3: Encode the payload as base64 for safe transmission in WhatsApp button
    const encodedPayload = btoa(JSON.stringify(tokenPayload));
    
    // Step 4: Hash the plain token for secure storage (never store plain tokens)
    const tokenHash = await hashToken(plainToken);

    console.log(`[VerificationService] Encoded payload length: ${encodedPayload.length}, tokenHash: ${tokenHash}`);

    // Step 5: Store the token record in database with hashed token
    await this.db
      .prepare('INSERT INTO verification_tokens (id, token_hash, phone_number, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(tokenId, tokenHash, phoneNumber, expiresAt, now)
      .run();

    console.log(`[VerificationService] Token saved to database successfully`);

    // Step 6: Return encoded payload for WhatsApp and token ID for tracking
    return { token: encodedPayload, tokenId };
  }

  /**
   * Validates and consumes a verification token (marks it as used)
   * 
   * Flow:
   * 1. Decode and validate the token payload structure
   * 2. Verify phone number matches the expected value
   * 3. Hash the token and search for matching database record
   * 4. Check token exists, is not expired, and hasn't been used
   * 5. Mark token as used to prevent replay attacks
   * 6. Return validation result with user status
   */
  async validateAndConsumeToken(encodedToken: string, phoneNumber: string): Promise<{ isValid: boolean; isNewUser?: boolean }> {
    console.log(`[VerificationService] Validating token for phone: ${phoneNumber}, token length: ${encodedToken.length}`);
    
    // Step 1: Decode and validate the token payload structure
    const payload = await this.decodeTokenPayload(encodedToken);
    if (!payload) {
      console.log(`[VerificationService] Failed to decode token payload`);
      return { isValid: false };
    }

    console.log(`[VerificationService] Decoded payload:`, payload);

    // Step 2: Verify the phone number in the token matches what we expect
    // This prevents token reuse across different phone numbers
    if (payload.phoneNumber !== phoneNumber) {
      console.log(`[VerificationService] Phone number mismatch. Expected: ${phoneNumber}, Got: ${payload.phoneNumber}`);
      return { isValid: false };
    }

    const now = Math.floor(Date.now() / 1000);
    
    // Step 3: Hash the token to match against database records
    const tokenHash = await hashToken(payload.token);

    console.log(`[VerificationService] Looking for token with hash: ${tokenHash}, current time: ${now}`);

    // Step 4: Find the token record in database with all security checks
    // - token_hash matches (correct token)
    // - phone_number matches (correct user)
    // - expires_at > now (not expired)
    // - used_at IS NULL (not already used)
    const tokenRecord = await this.db
      .prepare('SELECT * FROM verification_tokens WHERE token_hash = ? AND phone_number = ? AND expires_at > ? AND used_at IS NULL')
      .bind(tokenHash, phoneNumber, now)
      .first<VerificationToken>();

    if (!tokenRecord) {
      console.log(`[VerificationService] Token record not found or expired/used`);
      return { isValid: false };
    }

    console.log(`[VerificationService] Found valid token record:`, tokenRecord);

    // Step 5: Mark token as used to prevent replay attacks
    // Once a token is used, it cannot be used again
    await this.db
      .prepare('UPDATE verification_tokens SET used_at = ? WHERE id = ?')
      .bind(now, tokenRecord.id)
      .run();

    console.log(`[VerificationService] Token marked as used`);

    // Step 6: Return success with user status from the original payload
    return { isValid: true, isNewUser: payload.isNewUser };
  }

  /**
   * Decodes and validates a token payload without consuming it
   * 
   * Flow:
   * 1. Decode base64 encoded payload
   * 2. Parse JSON and validate structure
   * 3. Check token expiration
   * 4. Return validated payload or null if invalid
   */
  async decodeTokenPayload(encodedToken: string): Promise<TokenPayload | null> {
    console.log(`[VerificationService] Decoding token payload, encoded length: ${encodedToken.length}`);
    
    try {
      // Step 1: Decode base64 and parse JSON
      const decodedPayload = JSON.parse(atob(encodedToken));
      
      console.log(`[VerificationService] Raw decoded payload:`, decodedPayload);
      
      // Step 2: Validate payload structure - ensure all required fields are present
      if (!decodedPayload.token || typeof decodedPayload.isNewUser !== 'boolean' || 
          !decodedPayload.phoneNumber || !decodedPayload.timestamp || !decodedPayload.expiresAt) {
        console.log(`[VerificationService] Invalid payload structure`);
        return null;
      }

      // Step 3: Check if token has expired (client-side validation)
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

  /**
   * Extracts phone number from token without validation or consumption
   * 
   * Flow:
   * 1. Decode token payload
   * 2. Extract and return phone number
   * 
   * Note: This is a utility method for quick phone number extraction
   */
  async getPhoneNumberFromToken(encodedToken: string): Promise<string | null> {
    console.log(`[VerificationService] Extracting phone number from token`);
    
    // Step 1: Decode the token payload
    const payload = await this.decodeTokenPayload(encodedToken);
    
    // Step 2: Extract phone number if payload is valid
    const phoneNumber = payload ? payload.phoneNumber : null;
    console.log(`[VerificationService] Extracted phone number: ${phoneNumber}`);
    return phoneNumber;
  }

  /**
   * Validates a token WITHOUT consuming it (read-only validation)
   * 
   * Flow:
   * 1. Decode and validate token payload
   * 2. Verify phone number matches
   * 3. Check database for valid token record
   * 4. Return validation result without marking as used
   * 
   * Note: This method is used when you need to check token validity
   * but want to consume it later with a different method
   */
  async validateTokenOnly(encodedToken: string, phoneNumber: string): Promise<{ isValid: boolean; isNewUser?: boolean, sessionId?: string }> {
    // Step 1: Decode the token payload
    const payload = await this.decodeTokenPayload(encodedToken);
    if (!payload) {
      return { isValid: false };
    }

    // Step 2: Verify phone number matches
    if (payload.phoneNumber !== phoneNumber) {
      return { isValid: false };
    }

    const now = Math.floor(Date.now() / 1000);
    const tokenHash = await hashToken(payload.token);

    // Step 3: Find the token record without consuming it (no UPDATE query)
    const tokenRecord = await this.db
      .prepare('SELECT * FROM verification_tokens WHERE token_hash = ? AND phone_number = ? AND expires_at > ?')
      .bind(tokenHash, phoneNumber, now)
      .first<VerificationToken>();

    console.log(`[VerificationService] Found token record:`, tokenRecord);

    // Step 4: Return validation result with user status
    return { isValid: !!tokenRecord, isNewUser: payload.isNewUser, sessionId: tokenRecord?.id };
  }

  /**
   * Creates a refresh token for maintaining user sessions
   * 
   * Flow:
   * 1. Generate unique token ID and secure random token
   * 2. Hash the token for secure storage
   * 3. Set long expiration (30 days)
   * 4. Store token record in database
   * 5. Return plain token and ID
   */
  async createRefreshToken(userId: string): Promise<{ token: string; tokenId: string }> {
    // Step 1: Generate identifiers and timestamps
    const now = Math.floor(Date.now() / 1000);
    const tokenId = generateRandomId();
    const plainToken = generateSecureToken(64); // Longer token for refresh tokens
    
    // Step 2: Hash the token for secure storage
    const tokenHash = await hashToken(plainToken);
    
    // Step 3: Set long expiration for refresh tokens (30 days)
    const expiresAt = now + (30 * 24 * 60 * 60); // 30 days

    // Step 4: Store refresh token record in database
    await this.db
      .prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(tokenId, userId, tokenHash, expiresAt, now)
      .run();

    // Step 5: Return plain token (for client) and token ID (for tracking)
    return { token: plainToken, tokenId };
  }

  /**
   * Validates a refresh token for token refresh operations
   * 
   * Flow:
   * 1. Hash the provided token
   * 2. Search database for matching, valid token record
   * 3. Check token exists, belongs to user, not expired, not revoked
   * 4. Return token record if valid, null otherwise
   */
  async validateRefreshToken(plainToken: string, userId: string): Promise<RefreshToken | null> {
    const now = Math.floor(Date.now() / 1000);
    
    // Step 1: Hash the token to match against database
    const tokenHash = await hashToken(plainToken);

    // Step 2: Find valid refresh token with all security checks
    // - token_hash matches (correct token)
    // - user_id matches (correct user)
    // - expires_at > now (not expired)
    // - revoked_at IS NULL (not revoked)
    const tokenRecord = await this.db
      .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ? AND user_id = ? AND expires_at > ? AND revoked_at IS NULL')
      .bind(tokenHash, userId, now)
      .first<RefreshToken>();

    return tokenRecord || null;
  }

  /**
   * Revokes a specific refresh token (logout from single device)
   * 
   * Flow:
   * 1. Mark the token as revoked with current timestamp
   * 2. Token becomes invalid for future use
   */
  async revokeRefreshToken(tokenId: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    
    // Step 1: Mark token as revoked (soft delete)
    await this.db
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?')
      .bind(now, tokenId)
      .run();
  }

  /**
   * Revokes all refresh tokens for a user (logout from all devices)
   * 
   * Flow:
   * 1. Find all active refresh tokens for the user
   * 2. Mark them all as revoked with current timestamp
   */
  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    
    // Step 1: Revoke all active refresh tokens for the user
    await this.db
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .bind(now, userId)
      .run();
  }

  /**
   * Cleanup expired tokens from database (maintenance operation)
   * 
   * Flow:
   * 1. Delete expired verification tokens
   * 2. Delete expired refresh tokens
   * 
   * Note: This should be run periodically to keep database clean
   */
  async cleanupExpiredTokens(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    
    // Step 1: Clean up expired verification tokens (hard delete)
    await this.db
      .prepare('DELETE FROM verification_tokens WHERE expires_at < ?')
      .bind(now)
      .run();

    // Step 2: Clean up expired refresh tokens (hard delete)
    await this.db
      .prepare('DELETE FROM refresh_tokens WHERE expires_at < ?')
      .bind(now)
      .run();
  }
}