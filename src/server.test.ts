import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from './server.ts';
import { InMemoryUserRepository } from './users/InMemoryUserRepository.ts';
import { seedUsers } from './users/seed.ts';

let server: RunningServer;
let repo: InMemoryUserRepository;

beforeEach(async () => {
  repo = new InMemoryUserRepository(seedUsers);
  server = await startServer({ port: 0, users: repo });
});

afterEach(async () => {
  await server.stop();
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return fetch(server.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('HTTP server', () => {
  it('answers a users query over POST with status 200 and JSON', async () => {
    const response = await post({ query: '{ users { id } }' });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^application\/json/);
    const body = await response.json();
    expect(body).toEqual({ data: { users: seedUsers.map(({ id }) => ({ id })) } });
  });

  it('passes the given repository to resolvers through the context', async () => {
    await repo.create({
      firstName: 'Kate',
      lastName: 'Moore',
      email: 'kate.moore@example.com',
      role: 'editor',
    });

    const body = await (await post({ query: '{ users { firstName } }' })).json();

    expect(body.data.users).toHaveLength(seedUsers.length + 1);
    expect(body.data.users.at(-1)).toEqual({ firstName: 'Kate' });
  });

  it('keeps changes between requests (updateUser, then user query sees it)', async () => {
    const id = seedUsers[1].id;

    const update = await post({
      query: 'mutation ($id: ID!) { updateUser(id: $id, input: { firstName: "Bobby" }) { id } }',
      variables: { id },
    });
    expect((await update.json()).errors).toBeUndefined();

    const body = await (
      await post({ query: 'query ($id: ID!) { user(id: $id) { firstName } }', variables: { id } })
    ).json();

    expect(body).toEqual({ data: { user: { firstName: 'Bobby' } } });
  });

  it('allows cross-origin requests (Access-Control-Allow-Origin header present)', async () => {
    const response = await post(
      { query: '{ users { id } }' },
      { origin: 'http://localhost:5173' },
    );

    expect(response.headers.get('access-control-allow-origin')).not.toBeNull();
  });

  it('returns status 400 for a malformed query', async () => {
    const response = await post({ query: '{ users { id ' });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors[0].extensions.code).toBe('GRAPHQL_PARSE_FAILED');
  });
});
