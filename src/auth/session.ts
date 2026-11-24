import type { SessionOptions } from 'iron-session';

/** What the encrypted session cookie holds. Empty when nobody is logged in. */
export interface SessionData {
  username?: string;
}

export const SESSION_COOKIE_NAME = 'userlist_session';
/** Fixed from login: reading the session never renews it. */
export const SESSION_TTL_SECONDS = 5 * 60;
/**
 * Iron (under iron-session) still accepts a seal this many seconds after its
 * ttl, to allow for clock skew. Not configurable through iron-session.
 */
const IRON_TIMESTAMP_SKEW_SECONDS = 60;
/** iron-session refuses shorter secrets. */
export const MIN_SESSION_SECRET_LENGTH = 32;

export interface SessionConfig {
  /** Encrypts and signs the cookie. At least 32 characters. */
  secret: string;
  /** Send the cookie over HTTPS only. Must be `false` on plain-HTTP localhost. */
  secure: boolean;
}

export function sessionOptions({ secret, secure }: SessionConfig): SessionOptions {
  if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(`Session secret must be at least ${MIN_SESSION_SECRET_LENGTH} characters`);
  }
  return {
    cookieName: SESSION_COOKIE_NAME,
    password: secret,
    // Iron adds its skew allowance to this, so the server rejects the seal
    // exactly SESSION_TTL_SECONDS after login, not a minute later.
    ttl: SESSION_TTL_SECONDS - IRON_TIMESTAMP_SKEW_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      // The browser keeps the cookie for the full 5 minutes too.
      maxAge: SESSION_TTL_SECONDS,
    },
  };
}
