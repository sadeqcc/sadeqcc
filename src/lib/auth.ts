import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { getDb } from './db';
import { nowIso } from './date';

const COOKIE = 'sadeq_session';
const SESSION_DAYS = 30;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET is required in production');
  }
  return 'dev-only-insecure-secret-change-me';
}

export function hashPassword(password: string, salt?: string): string {
  const s = salt ?? crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(password, s, 64).toString('hex');
  return `scrypt$${s}$${key}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, salt, key] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !key) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(key, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export interface SessionPayload {
  uid: string;
  ownerId: string;
  username: string;
  exp: number;
}

function sign(data: string): string {
  return crypto.createHmac('sha256', secret()).update(data).digest('base64url');
}

export function createToken(p: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(p)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

export async function setSession(p: Omit<SessionPayload, 'exp'>): Promise<void> {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const jar = await cookies();
  jar.set(COOKIE, createToken({ ...p, exp }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return readToken(jar.get(COOKIE)?.value);
}

export interface UserRow {
  id: string;
  ownerId: string;
  username: string;
  displayName: string | null;
  passwordHash: string;
  pinHash: string | null;
  role: string;
}

export async function findUser(username: string): Promise<UserRow | null> {
  const db = await getDb();
  return db.get<UserRow>('SELECT * FROM users WHERE username = ? AND deletedAt IS NULL', [
    username.trim().toLowerCase(),
  ]);
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const db = await getDb();
  return db.get<UserRow>('SELECT * FROM users WHERE id = ? AND deletedAt IS NULL', [id]);
}

export async function countUsers(): Promise<number> {
  const db = await getDb();
  const r = await db.get<{ n: number }>('SELECT COUNT(*) as n FROM users WHERE deletedAt IS NULL');
  return Number(r?.n ?? 0);
}

export async function createUser(username: string, password: string, displayName: string): Promise<UserRow> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const t = nowIso();
  await db.run(
    `INSERT INTO users (id, ownerId, username, displayName, passwordHash, pinHash, role, status, createdAt, updatedAt, createdBy)
     VALUES (?,?,?,?,?,NULL,'owner','active',?,?,?)`,
    [id, id, username.trim().toLowerCase(), displayName || username, hashPassword(password), t, t, id],
  );
  return (await getUserById(id))!;
}

/** Verifies the app PIN for sensitive actions (editing a finalized day, restore, delete). */
export async function verifyPin(userId: string, pin: string): Promise<boolean> {
  const u = await getUserById(userId);
  if (!u) return false;
  if (!u.pinHash) return true; // PIN not configured yet
  return verifyPassword(pin, u.pinHash);
}

export async function setPin(userId: string, pin: string | null): Promise<void> {
  const db = await getDb();
  await db.run('UPDATE users SET pinHash = ?, updatedAt = ? WHERE id = ?', [
    pin ? hashPassword(pin) : null,
    nowIso(),
    userId,
  ]);
}
