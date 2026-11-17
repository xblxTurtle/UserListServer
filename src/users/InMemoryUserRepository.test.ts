import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryUserRepository } from './InMemoryUserRepository.ts';
import { seedUsers } from './seed.ts';
import type { User } from './User.ts';

const NOW = '2026-06-01T12:00:00.000Z';

function seedCopy(): User[] {
  return seedUsers.map((user) => ({ ...user }));
}

describe('InMemoryUserRepository', () => {
  let repo: InMemoryUserRepository;

  beforeEach(() => {
    repo = new InMemoryUserRepository(seedUsers);
  });

  describe('constructor', () => {
    it('starts empty when no seed is given', async () => {
      const empty = new InMemoryUserRepository();
      expect(await empty.list()).toEqual([]);
    });

    it("does not mutate the seed array's objects when the store changes", async () => {
      const seed = seedCopy();
      const original = structuredClone(seed);
      const local = new InMemoryUserRepository(seed);

      await local.update(seedUsers[0].id, { firstName: 'Changed' });

      expect(seed).toEqual(original);
    });
  });

  describe('list', () => {
    it('returns all seeded users', async () => {
      expect(await repo.list()).toEqual(seedUsers);
    });

    it('returns users in insertion order', async () => {
      const local = new InMemoryUserRepository([
        { ...seedUsers[0], id: '10' },
        { ...seedUsers[1], id: 'abc' },
        { ...seedUsers[2], id: '2' },
      ]);

      const ids = (await local.list()).map((user) => user.id);

      expect(ids).toEqual(['10', 'abc', '2']);
    });

    it('returns copies, so mutating a result does not change the store', async () => {
      const [first] = await repo.list();
      first.firstName = 'Mutated';

      expect((await repo.getById(first.id))?.firstName).toBe(seedUsers[0].firstName);
    });
  });

  describe('getById', () => {
    it('returns the user with the given id', async () => {
      expect(await repo.getById(seedUsers[1].id)).toEqual(seedUsers[1]);
    });

    it('returns null for an unknown id', async () => {
      expect(await repo.getById('does-not-exist')).toBeNull();
    });

    it('returns null for inherited object keys like "constructor" and "__proto__"', async () => {
      for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
        expect(await repo.getById(key)).toBeNull();
      }
    });

    it('returns a copy, so mutating it does not change the store', async () => {
      const user = await repo.getById(seedUsers[0].id);
      user!.email = 'mutated@example.com';

      expect((await repo.getById(seedUsers[0].id))?.email).toBe(seedUsers[0].email);
    });
  });

  describe('create', () => {
    const input = {
      firstName: 'Kate',
      lastName: 'Moore',
      email: 'kate.moore@example.com',
      role: 'editor',
    };

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(NOW));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns the new user with the given fields', async () => {
      const created = await repo.create(input);

      expect(created).toMatchObject(input);
    });

    it('assigns a non-empty id that is not used by any existing user', async () => {
      const created = await repo.create(input);

      expect(created.id).toEqual(expect.any(String));
      expect(created.id).not.toBe('');
      expect(seedUsers.map((user) => user.id)).not.toContain(created.id);
    });

    it('assigns a different id to each new user', async () => {
      const first = await repo.create(input);
      const second = await repo.create(input);

      expect(first.id).not.toBe(second.id);
    });

    it('sets createdAt and updatedAt to the current time', async () => {
      const created = await repo.create(input);

      expect(created.createdAt).toBe(NOW);
      expect(created.updatedAt).toBe(NOW);
    });

    it('persists the user, so getById returns it', async () => {
      const created = await repo.create(input);

      expect(await repo.getById(created.id)).toEqual(created);
    });

    it('adds the user to the end of list and keeps existing users', async () => {
      const created = await repo.create(input);

      expect(await repo.list()).toEqual([...seedUsers, created]);
    });

    it('works on an empty repository', async () => {
      const empty = new InMemoryUserRepository();

      const created = await empty.create(input);

      expect(await empty.list()).toEqual([created]);
    });

    it('returns a copy, so mutating it does not change the store', async () => {
      const created = await repo.create(input);
      created.firstName = 'Mutated';

      expect((await repo.getById(created.id))?.firstName).toBe('Kate');
    });

    it('does not keep a reference to the input object', async () => {
      const mutableInput = { ...input };
      const created = await repo.create(mutableInput);
      mutableInput.firstName = 'Mutated';

      expect((await repo.getById(created.id))?.firstName).toBe('Kate');
    });
  });

  describe('update', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(NOW));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('updates only the provided fields and keeps the rest', async () => {
      const updated = await repo.update(seedUsers[1].id, { firstName: 'Bobby' });

      expect(updated).toEqual({ ...seedUsers[1], firstName: 'Bobby', updatedAt: NOW });
    });

    it('updates several fields at once', async () => {
      const input = {
        firstName: 'Robert',
        lastName: 'Smithson',
        email: 'robert@example.com',
        role: 'admin',
      };

      const updated = await repo.update(seedUsers[1].id, input);

      expect(updated).toEqual({ ...seedUsers[1], ...input, updatedAt: NOW });
    });

    it('ignores fields explicitly set to undefined', async () => {
      const updated = await repo.update(seedUsers[1].id, {
        firstName: 'Bobby',
        lastName: undefined,
        email: undefined,
        role: undefined,
      });

      expect(updated).toEqual({ ...seedUsers[1], firstName: 'Bobby', updatedAt: NOW });
    });

    it('sets updatedAt to the current time and keeps createdAt', async () => {
      const updated = await repo.update(seedUsers[2].id, { role: 'editor' });

      expect(updated?.updatedAt).toBe(NOW);
      expect(updated?.createdAt).toBe(seedUsers[2].createdAt);
    });

    it('bumps updatedAt even when the input is empty', async () => {
      const updated = await repo.update(seedUsers[2].id, {});

      expect(updated).toEqual({ ...seedUsers[2], updatedAt: NOW });
    });

    it('persists the change, so later getById and list return it', async () => {
      await repo.update(seedUsers[3].id, { lastName: 'Green' });

      expect((await repo.getById(seedUsers[3].id))?.lastName).toBe('Green');
      const fromList = (await repo.list()).find((user) => user.id === seedUsers[3].id);
      expect(fromList?.lastName).toBe('Green');
    });

    it('returns null for an unknown id and leaves the store unchanged', async () => {
      const result = await repo.update('does-not-exist', { firstName: 'Nobody' });

      expect(result).toBeNull();
      expect(await repo.list()).toEqual(seedUsers);
    });

    it('returns a copy, so mutating it does not change the store', async () => {
      const updated = await repo.update(seedUsers[4].id, { firstName: 'Evelyn' });
      updated!.firstName = 'Mutated';

      expect((await repo.getById(seedUsers[4].id))?.firstName).toBe('Evelyn');
    });
  });
});
