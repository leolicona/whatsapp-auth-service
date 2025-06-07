import { SignJWT, jwtVerify } from 'jose';
import { CONFIG } from '../config';

const encoder = new TextEncoder();
const secretJWT = 'Y0ggyGvAVmzVzCPOdprgl5DQw0Ei1jrit25DeA23sBziwcvxbJIewLxle4F8gO5v'

export async function createJWT(payload: any, expiresIn = CONFIG.JWT.EXPIRY): Promise<string> {
  const secret = encoder.encode(secretJWT/* CONFIG.JWT.SECRET */);
  
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .sign(secret);
}

export async function verifyJWT<T>(token: string): Promise<T | null> {
  try {
    const secret = encoder.encode(secretJWT/* CONFIG.JWT.SECRET */);
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as T;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}