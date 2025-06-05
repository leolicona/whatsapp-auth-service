import { D1Database } from '@cloudflare/workers-types';
import { User, Session } from '../types';
import { generateRandomId } from '../utils/crypto';

export class UserService {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async findUserByPhone(phoneNumber: string): Promise<User | null> {
    const result = await this.db
      .prepare('SELECT * FROM users WHERE phone_number = ?')
      .bind(phoneNumber)
      .first<User>();
    
    return result || null;
  }

  async findUserById(id: string): Promise<User | null> {
    const result = await this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<User>();
    
    return result || null;
  }

  async createUser(phoneNumber: string, name: string | null = null): Promise<User> {
    const now = Math.floor(Date.now() / 1000);
    const userId = generateRandomId();
    
    await this.db
      .prepare('INSERT INTO users (id, phone_number, name, created_at, last_login) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, phoneNumber, name, now, now)
      .run();
    
    return {
      id: userId,
      phone_number: phoneNumber,
      name,
      created_at: now,
      last_login: now
    };
  }

  async updateLastLogin(userId: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    
    await this.db
      .prepare('UPDATE users SET last_login = ? WHERE id = ?')
      .bind(now, userId)
      .run();
  }

  async createSession(userId: string, expiresIn: number): Promise<Session> {
    const now = Math.floor(Date.now() / 1000);
    const sessionId = generateRandomId(32);
    const expiresAt = now + expiresIn;
    
    await this.db
      .prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, status) VALUES (?, ?, ?, ?, ?)')
      .bind(sessionId, userId, now, expiresAt, 'pending')
      .run();
    
    return {
      id: sessionId,
      user_id: userId,
      created_at: now,
      expires_at: expiresAt,
      status: 'pending'
    };
  }

  async updateSessionTokens(sessionId: string, authToken: string, refreshToken: string): Promise<void> {
    await this.db
      .prepare('UPDATE sessions SET auth_token = ?, refresh_token = ?, status = ? WHERE id = ?')
      .bind(authToken, refreshToken, 'ready', sessionId)
      .run();
  }

  async getSessionTokens(sessionId: string): Promise<{ authToken: string; refreshToken: string } | null> {
    const session = await this.db
      .prepare('SELECT auth_token, refresh_token FROM sessions WHERE id = ? AND status = ?')
      .bind(sessionId, 'ready')
      .first<Session>();

    if (session && session.auth_token && session.refresh_token) {
      // Mark as completed after retrieval
      await this.db
        .prepare('UPDATE sessions SET status = ? WHERE id = ?')
        .bind('completed', sessionId)
        .run();
      return { authToken: session.auth_token, refreshToken: session.refresh_token };
    }
    return null;
  }

  async findSessionById(sessionId: string): Promise<Session | null> {
    const result = await this.db
      .prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?')
      .bind(sessionId, Math.floor(Date.now() / 1000))
      .first<Session>();
    
    return result || null;
  }

  async findSessionByUserId(userId: string): Promise<Session | null> {
    const result = await this.db
      .prepare('SELECT * FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1')
      .bind(userId, Math.floor(Date.now() / 1000))
      .first<Session>();

    return result || null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM sessions WHERE id = ?')
      .bind(sessionId)
      .run();
  }
}