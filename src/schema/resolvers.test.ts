import assert from 'node:assert';
import { ApolloServer } from '@apollo/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../context.ts';
import { resolvers } from './resolvers.ts';
import { typeDefs } from './typeDefs.ts';
import { InMemoryUserRepository } from '../users/InMemoryUserRepository.ts';
import { seedUsers } from '../users/seed.ts';

const USER_FIELDS = 'id firstName lastName email role createdAt updatedAt';

const USERS = `query { users { ${USER_FIELDS} } }`;
const USER = `query ($id: ID!) { user(id: $id) { ${USER_FIELDS} } }`;
const CREATE_USER = `
  mutation ($input: CreateUserInput!) {
    createUser(input: $input) { ${USER_FIELDS} }
  }
`;
const UPDATE_USER = `
  mutation ($id: ID!, $input: UpdateUserInput!) {
    updateUser(id: $id, input: $input) { ${USER_FIELDS} }
  }
`;

const validCreateInput = {
  firstName: 'Kate',
  lastName: 'Moore',
  email: 'kate.moore@example.com',
  role: 'editor',
};

const invalidEmails = ['not-an-email', 'a@b', '@example.com', 'kate@', 'kate moore@example.com'];

const server = new ApolloServer<AppContext>({ typeDefs, resolvers });

let repo: InMemoryUserRepository;

beforeEach(() => {
  repo = new InMemoryUserRepository(seedUsers);
});

async function run(query: string, variables?: Record<string, unknown>) {
  const response = await server.executeOperation(
    { query, variables },
    { contextValue: { users: repo, username: 'admin' } },
  );
  assert(response.body.kind === 'single');
  return response.body.singleResult;
}

function errorCode(result: Awaited<ReturnType<typeof run>>) {
  return result.errors?.[0]?.extensions?.code;
}

function errorField(result: Awaited<ReturnType<typeof run>>) {
  return result.errors?.[0]?.extensions?.field;
}

describe('GraphQL API', () => {
  describe('Query.users', () => {
    it('returns all users with every field', async () => {
      const result = await run(USERS);

      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ users: seedUsers });
    });

    it('returns an empty list when there are no users', async () => {
      repo = new InMemoryUserRepository([]);

      const result = await run('query { users { id } }');

      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ users: [] });
    });
  });

  describe('Query.user', () => {
    it('returns the user with the given id', async () => {
      const result = await run(USER, { id: seedUsers[1].id });

      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ user: seedUsers[1] });
    });

    it('returns null for an unknown id', async () => {
      const result = await run(USER, { id: 'does-not-exist' });

      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ user: null });
    });
  });

  describe('Mutation.createUser', () => {
    it('creates a user and returns it with id and timestamps', async () => {
      const result = await run(CREATE_USER, { input: validCreateInput });

      expect(result.errors).toBeUndefined();
      const created = (result.data as { createUser: Record<string, string> }).createUser;
      expect(created).toMatchObject(validCreateInput);
      expect(created.id).toEqual(expect.any(String));
      expect(created.id).not.toBe('');
      expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
      expect(created.updatedAt).toBe(created.createdAt);
    });

    it('the new user appears in Query.users', async () => {
      const created = await run(CREATE_USER, { input: validCreateInput });
      const createdUser = (created.data as { createUser: { id: string } }).createUser;

      const result = await run(USERS);

      const users = (result.data as { users: { id: string }[] }).users;
      expect(users).toHaveLength(seedUsers.length + 1);
      expect(users.at(-1)?.id).toBe(createdUser.id);
    });

    it('trims names and role, and trims and lowercases email', async () => {
      const result = await run(CREATE_USER, {
        input: {
          firstName: '  Kate  ',
          lastName: ' Moore ',
          email: '  Kate.Moore@Example.COM ',
          role: ' editor ',
        },
      });

      expect(result.errors).toBeUndefined();
      expect(result.data).toMatchObject({ createUser: validCreateInput });
    });

    describe.each(['firstName', 'lastName', 'role'])('rejects a blank %s', (field) => {
      it.each(['', '   '])('with BAD_USER_INPUT and the field name (value: %j)', async (value) => {
        const result = await run(CREATE_USER, { input: { ...validCreateInput, [field]: value } });

        expect(result.data).toBeNull();
        expect(errorCode(result)).toBe('BAD_USER_INPUT');
        expect(errorField(result)).toBe(field);
        expect(await repo.list()).toHaveLength(seedUsers.length);
      });
    });

    it.each(invalidEmails)('rejects an invalid email with BAD_USER_INPUT (%j)', async (email) => {
      const result = await run(CREATE_USER, { input: { ...validCreateInput, email } });

      expect(result.data).toBeNull();
      expect(errorCode(result)).toBe('BAD_USER_INPUT');
      expect(errorField(result)).toBe('email');
      expect(await repo.list()).toHaveLength(seedUsers.length);
    });

    it('rejects a missing required field (GraphQL validation error)', async () => {
      const result = await run(`
        mutation {
          createUser(input: { firstName: "Kate", lastName: "Moore", role: "editor" }) { id }
        }
      `);

      expect(result.data).toBeUndefined();
      expect(errorCode(result)).toBe('GRAPHQL_VALIDATION_FAILED');
      expect(await repo.list()).toHaveLength(seedUsers.length);
    });
  });

  describe('Mutation.updateUser', () => {
    const target = seedUsers[1];

    it('updates only the provided fields', async () => {
      const result = await run(UPDATE_USER, { id: target.id, input: { firstName: 'Bobby' } });

      expect(result.errors).toBeUndefined();
      const updated = (result.data as { updateUser: Record<string, string> }).updateUser;
      expect(updated).toMatchObject({
        id: target.id,
        firstName: 'Bobby',
        lastName: target.lastName,
        email: target.email,
        role: target.role,
        createdAt: target.createdAt,
      });
      expect(await repo.getById(target.id)).toMatchObject({ firstName: 'Bobby' });
    });

    it('trims and lowercases values like createUser', async () => {
      const result = await run(UPDATE_USER, {
        id: target.id,
        input: {
          firstName: '  Robert ',
          lastName: ' Smithson  ',
          email: ' Robert.Smithson@Example.COM ',
          role: '  admin ',
        },
      });

      expect(result.errors).toBeUndefined();
      expect(result.data).toMatchObject({
        updateUser: {
          firstName: 'Robert',
          lastName: 'Smithson',
          email: 'robert.smithson@example.com',
          role: 'admin',
        },
      });
    });

    it.each(['firstName', 'lastName', 'email', 'role'])(
      'rejects null for %s with BAD_USER_INPUT',
      async (field) => {
        const result = await run(UPDATE_USER, { id: target.id, input: { [field]: null } });

        expect(result.data).toBeNull();
        expect(errorCode(result)).toBe('BAD_USER_INPUT');
        expect(errorField(result)).toBe(field);
      },
    );

    describe.each(['firstName', 'lastName', 'role'])('rejects a blank %s', (field) => {
      it.each(['', '   '])('with BAD_USER_INPUT (value: %j)', async (value) => {
        const result = await run(UPDATE_USER, { id: target.id, input: { [field]: value } });

        expect(result.data).toBeNull();
        expect(errorCode(result)).toBe('BAD_USER_INPUT');
        expect(errorField(result)).toBe(field);
      });
    });

    it.each(invalidEmails)('rejects an invalid email with BAD_USER_INPUT (%j)', async (email) => {
      const result = await run(UPDATE_USER, { id: target.id, input: { email } });

      expect(result.data).toBeNull();
      expect(errorCode(result)).toBe('BAD_USER_INPUT');
      expect(errorField(result)).toBe('email');
    });

    it('returns NOT_FOUND for an unknown id', async () => {
      const result = await run(UPDATE_USER, {
        id: 'does-not-exist',
        input: { firstName: 'Nobody' },
      });

      expect(result.data).toBeNull();
      expect(errorCode(result)).toBe('NOT_FOUND');
    });

    it('does not change the user when validation fails', async () => {
      const result = await run(UPDATE_USER, {
        id: target.id,
        input: { firstName: 'Bobby', email: 'not-an-email' },
      });

      expect(errorCode(result)).toBe('BAD_USER_INPUT');
      expect(await repo.getById(target.id)).toEqual(target);
    });
  });
});

describe('what resolvers pass to the repository', () => {
  const id = seedUsers[1].id;

  it('createUser stores validated input', async () => {
    const create = vi.spyOn(repo, 'create');
    const input = { ...validCreateInput, firstName: ' Kate ', email: 'Kate.Moore@Example.com' };
    await run(CREATE_USER, { input });

    expect(create.mock.calls).toStrictEqual([[validCreateInput]]);
  });

  it('createUser does not call the repository with invalid input', async () => {
    const create = vi.spyOn(repo, 'create');
    await run(CREATE_USER, { input: { ...validCreateInput, email: 'invalid' } });

    expect(create).not.toHaveBeenCalled();
  });

  it('updateUser stores validated input, without the omitted fields', async () => {
    const update = vi.spyOn(repo, 'update');
    await run(UPDATE_USER, { id, input: { role: ' admin ' } });

    // toStrictEqual, so omitted fields must not arrive as `undefined` keys.
    expect(update.mock.calls).toStrictEqual([[id, { role: 'admin' }]]);
  });

  it('updateUser does not call the repository with null', async () => {
    const update = vi.spyOn(repo, 'update');
    await run(UPDATE_USER, { id, input: { role: null } });

    expect(update).not.toHaveBeenCalled();
  });
});

// Resolvers are called directly here, because GraphQL responses hide a skipped conversion.
describe('what resolvers return', () => {
  const { Query, Mutation } = resolvers;
  const id = seedUsers[1].id;
  const apiUser = { __typename: 'User' };

  it('users converts every user', async () => {
    const result = await Query.users({}, {}, { users: repo, username: 'admin' });
    expect(result).toStrictEqual(seedUsers.map((user) => ({ ...apiUser, ...user })));
  });

  it('user converts the user', async () => {
    const result = await Query.user({}, { id }, { users: repo, username: 'admin' });
    expect(result).toStrictEqual({ ...apiUser, ...seedUsers[1] });
  });

  it('createUser converts the created user', async () => {
    const result = await Mutation.createUser({}, { input: validCreateInput }, { users: repo, username: 'admin' });
    expect(result).toMatchObject(apiUser);
  });

  it('updateUser converts the updated user', async () => {
    const result = await Mutation.updateUser({}, { id, input: {} }, { users: repo, username: 'admin' });
    expect(result).toMatchObject(apiUser);
  });
});
