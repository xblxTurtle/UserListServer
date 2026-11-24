import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing with Node's built-in scrypt (salted, memory-hard).
 *
 * Stored format: `scrypt$<salt>$<hash>`, both base64url. The scrypt cost
 * parameters are Node's defaults (N=16384, r=8, p=1). If they ever change,
 * encode them in the string so existing hashes still verify.
 */

const SCHEME = 'scrypt';
const SALT_BYTES = 16;
const KEY_BYTES = 64;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  // Async scrypt runs on the libuv thread pool, so logins don't block the event loop.
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_BYTES, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt);
  return `${SCHEME}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/** Resolves to `false`, never throws, when `stored` is not a valid hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== SCHEME) return false;

  const salt = Buffer.from(parts[1], 'base64url');
  const expected = Buffer.from(parts[2], 'base64url');
  // timingSafeEqual throws on buffers of different lengths.
  if (salt.length === 0 || expected.length !== KEY_BYTES) return false;

  const actual = await deriveKey(password, salt);
  return timingSafeEqual(actual, expected);
}
