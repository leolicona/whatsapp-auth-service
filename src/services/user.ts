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
      .prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(sessionId, userId, now, expiresAt)
      .run();
    
    return {
      id: sessionId,
      user_id: userId,
      created_at: now,
      expires_at: expiresAt
    };
  }

  async findSessionById(sessionId: string): Promise<Session | null> {
    const result = await this.db
      .prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?')
      .bind(sessionId, Math.floor(Date.now() / 1000))
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