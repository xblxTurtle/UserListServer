import { describe, expect, it } from 'vitest';
import { inMemoryCredentialStore as store } from './inMemoryCredentialStore.ts';

// The development passwords, which appear only in tests. Source holds hashes only.
describe('inMemoryCredentialStore', () => {
  it.each([
    ['admin', 'admin123'],
    ['demo', 'demo123'],
  ])('verifies %s with the right password', async (username, password) => {
    expect(await store.verify(username, password)).toBe(true);
  });

  it('rejects a known username with the wrong password', async () => {
    expect(await store.verify('admin', 'nope')).toBe(false);
  });

  it("rejects another user's password", async () => {
    expect(await store.verify('admin', 'demo123')).toBe(false);
  });

  it('rejects an unknown username', async () => {
    expect(await store.verify('nobody', 'admin123')).toBe(false);
  });

  it('matches usernames exactly (case-sensitive)', async () => {
    expect(await store.verify('Admin', 'admin123')).toBe(false);
  });
});
