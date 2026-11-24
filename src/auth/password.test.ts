import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.ts';

describe('hashPassword', () => {
  it('produces a scrypt$<salt>$<hash> string, not the password', async () => {
    const hash = await hashPassword('correct horse');

    expect(hash).toMatch(/^scrypt\$[\w-]+\$[\w-]+$/);
    expect(hash).not.toContain('correct horse');
  });

  it('uses a random salt, so the same password hashes differently', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });
});

describe('verifyPassword', () => {
  it('accepts the password that was hashed', async () => {
    const hash = await hashPassword('correct horse');

    expect(await verifyPassword('correct horse', hash)).toBe(true);
  });

  it('rejects a different password', async () => {
    const hash = await hashPassword('correct horse');

    expect(await verifyPassword('wrong horse', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it.each([
    ['empty string', ''],
    ['wrong scheme', 'bcrypt$abc$def'],
    ['missing parts', 'scrypt$abc'],
    ['extra parts', 'scrypt$abc$def$ghi'],
    ['empty hash', 'scrypt$abc$'],
    ['hash of the wrong length', 'scrypt$c2FsdHNhbHRzYWx0c2FsdA$c2hvcnQ'],
  ])('returns false (does not throw) for a malformed stored hash: %s', async (_label, stored) => {
    expect(await verifyPassword('anything', stored)).toBe(false);
  });
});
