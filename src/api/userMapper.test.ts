import { describe, expect, it } from 'vitest';
import { fromGqlCreateInput, fromGqlUpdateInput, toGqlUser } from './userMapper.ts';
import { parseCreateUserInput, parseUpdateUserInput } from './userValidation.ts';
import { seedUsers } from '../users/seed.ts';
import type { User } from '../users/User.ts';

const user: User = seedUsers[0]!;
const input = { firstName: 'Kate', lastName: 'Moore', email: 'kate@example.com', role: 'editor' };

describe('userMapper', () => {
  describe('toGqlUser', () => {
    it('copies every API field and adds __typename', () => {
      expect(toGqlUser(user)).toStrictEqual({ __typename: 'User', ...user });
    });

    it('drops storage-only fields', () => {
      const stored = { ...user, passwordHash: 'secret' };
      expect(toGqlUser(stored)).not.toHaveProperty('passwordHash');
    });
  });

  describe('fromGqlCreateInput', () => {
    it('copies every input field', () => {
      expect(fromGqlCreateInput(parseCreateUserInput(input))).toStrictEqual(input);
    });

    it('drops fields that are not model input', () => {
      const extra = { ...parseCreateUserInput(input), id: 'injected' };
      expect(fromGqlCreateInput(extra)).toStrictEqual(input);
    });

    it('accepts only validated input', () => {
      // @ts-expect-error raw input must go through parseCreateUserInput. Checked by typecheck.
      fromGqlCreateInput(input);
    });
  });

  describe('fromGqlUpdateInput', () => {
    it('copies every input field', () => {
      expect(fromGqlUpdateInput(parseUpdateUserInput(input))).toStrictEqual(input);
    });

    it('leaves omitted fields out, so a database cannot write them as NULL', () => {
      const valid = parseUpdateUserInput({ role: 'admin' });
      // toStrictEqual, because toEqual ignores keys with an undefined value.
      expect(fromGqlUpdateInput(valid)).toStrictEqual({ role: 'admin' });
    });

    it('accepts only validated input', () => {
      // @ts-expect-error raw input must go through parseUpdateUserInput. Checked by typecheck.
      fromGqlUpdateInput({ role: 'admin' });
    });
  });
});
