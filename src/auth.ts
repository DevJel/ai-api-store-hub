import { SignJWT, jwtVerify } from 'jose';
import type { Env, Tenant } from './types';

const encoder = new TextEncoder();

export async function hashPassword(password: string): Promise<string> {
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password);
  return computed === hash;
}

export async function createSessionToken(tenant: Tenant, secret: string): Promise<string> {
  const key = encoder.encode(secret);
  return new SignJWT({
    sub: tenant.id,
    email: tenant.email,
    plan: tenant.plan,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
}

export async function verifySessionToken(token: string, secret: string) {
  const key = encoder.encode(secret);
  const { payload } = await jwtVerify(token, key);
  return payload as { sub: string; email: string; plan: string };
}

export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = 'sk-ash-' + btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 40);
  const prefix = raw.slice(0, 12) + '...';
  // simple hash for storage (use a proper KDF in production)
  const hash = btoa(raw); // placeholder – replace with SHA-256 of raw
  return { raw, prefix, hash };
}

export async function hashApiKey(raw: string): Promise<string> {
  const data = encoder.encode(raw);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
