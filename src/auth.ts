import { SignJWT, jwtVerify } from 'jose';
import type { Tenant } from './types';
const encoder = new TextEncoder();
const ITERATIONS = 310000;

function toBase64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function fromBase64(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored.startsWith('pbkdf2$')) {
    // Backward-compatible verification for accounts created before the PBKDF2 migration.
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(password));
    const legacy = toBase64(new Uint8Array(digest));
    return legacy === stored;
  }
  const [, rounds, saltText, expectedText] = stored.split('$');
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromBase64(saltText), iterations: Number(rounds), hash: 'SHA-256' }, key, 256);
  const actual = new Uint8Array(bits), expected = fromBase64(expectedText);
  if (actual.length !== expected.length) return false;
  let diff = 0; for (let i=0;i<actual.length;i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
export async function createSessionToken(tenant: Tenant, secret: string): Promise<string> {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  return new SignJWT({ sub: tenant.id, email: tenant.email, plan: tenant.plan })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(encoder.encode(secret));
}
export async function verifySessionToken(token: string, secret: string) {
  if (!secret || secret.length < 32) throw new Error('Session service is not configured');
  const { payload } = await jwtVerify(token, encoder.encode(secret));
  return payload as { sub: string; email: string; plan: string };
}
export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = 'sk-ash-' + toBase64(bytes).replace(/[+/=]/g, '').slice(0, 40);
  return { raw, prefix: raw.slice(0, 12) + '...', hash: '' };
}
export async function hashApiKey(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
