import { SignJWT, jwtVerify } from 'jose';
import { CONFIG } from '../config';

const encoder = new TextEncoder();

export async function createJWT(payload: any, expiresIn = CONFIG.JWT.EXPIRY): Promise<string> {
  const secret = encoder.encode(CONFIG.JWT.SECRET);
  
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .sign(secret);
}

export async function verifyJWT<T>(token: string): Promise<T | null> {
  try {
    const secret = encoder.encode(CONFIG.JWT.SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as T;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}