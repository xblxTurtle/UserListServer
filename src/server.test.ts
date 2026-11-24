import assert from 'node:assert';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inMemoryCredentialStore } from './auth/inMemoryCredentialStore.ts';
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from './auth/session.ts';
import { startServer, type RunningServer } from './server.ts';
import { InMemoryUserRepository } from './users/InMemoryUserRepository.ts';
import { seedUsers } from './users/seed.ts';

const SESSION = { secret: 'test-session-secret-at-least-32-characters', secure: false };

let server: RunningServer;
let repo: InMemoryUserRepository;
beforeEach(async () => {
  repo = new InMemoryUserRepository(seedUsers);
  server = await startServer({
    port: 0,
    users: repo,
    credentials: inMemoryCredentialStore,
    session: SESSION,
  });
});

afterEach(async () => {
  vi.useRealTimers();
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

  it('serves GraphQL at /graphql', () => {
    expect(new URL(server.url).pathname).toBe('/graphql');
  });

  it('returns 404 for paths outside /graphql', async () => {
    const response = await fetch(new URL('/nope', server.url), { method: 'GET' });

    expect(response.status).toBe(404);
  });

  it('returns status 400 for a malformed query', async () => {
    const response = await post({ query: '{ users { id ' });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors[0].extensions.code).toBe('GRAPHQL_PARSE_FAILED');
  });
});

describe('auth routes', () => {
  function login(body: unknown) {
    return fetch(new URL('/login', server.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function getSession(cookie?: string) {
    return fetch(new URL('/session', server.url), {
      headers: cookie === undefined ? {} : { cookie },
    });
  }

  /** `name=value` of the session cookie, ready to send back in a Cookie header. */
  function sessionCookie(response: Response): string {
    const header = response.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    assert(header !== undefined, 'no session cookie was set');
    return header.split(';')[0];
  }

  it('POST /login with valid credentials returns 200, the username and a session cookie', async () => {
    const response = await login({ username: 'admin', password: 'admin123' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ username: 'admin' });
    expect(sessionCookie(response)).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=.+`));
  });

  it('sets an HttpOnly, SameSite=Lax cookie that lasts 5 minutes', async () => {
    const response = await login({ username: 'admin', password: 'admin123' });

    const [header] = response.headers.getSetCookie();
    expect(SESSION_TTL_SECONDS).toBe(300);
    expect(header).toMatch(/Max-Age=300(;|$)/);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).toMatch(/Path=\//);
  });

  it('does not put the username in the cookie in readable form', async () => {
    const response = await login({ username: 'admin', password: 'admin123' });

    expect(sessionCookie(response)).not.toContain('admin');
  });

  it.each([
    ['wrong password', { username: 'admin', password: 'nope' }],
    ['unknown username', { username: 'nobody', password: 'admin123' }],
    ['empty values', { username: '', password: '' }],
  ])('POST /login returns 401 and no cookie for %s', async (_label, body) => {
    const response = await login(body);

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it.each([
    ['missing password', { username: 'admin' }],
    ['missing username', { password: 'admin123' }],
    ['non-string values', { username: 1, password: true }],
    ['an array body', ['admin', 'admin123']],
  ])('POST /login returns 400 and no cookie for %s', async (_label, body) => {
    const response = await login(body);

    expect(response.status).toBe(400);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('POST /login returns 400 when there is no JSON body', async () => {
    const response = await fetch(new URL('/login', server.url), { method: 'POST' });

    expect(response.status).toBe(400);
  });

  it('POST /login returns a JSON 400 for malformed JSON', async () => {
    const response = await fetch(new URL('/login', server.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bad',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Request body must be valid JSON' });
  });

  it('GET /session returns 401 when there is no session cookie', async () => {
    const response = await getSession();

    expect(response.status).toBe(401);
  });

  it('GET /session returns 200 and the username after login', async () => {
    const cookie = sessionCookie(await login({ username: 'admin', password: 'admin123' }));

    const response = await getSession(cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ username: 'admin' });
  });

  it('GET /session does not renew the cookie (TTL is fixed from login)', async () => {
    const cookie = sessionCookie(await login({ username: 'admin', password: 'admin123' }));

    const response = await getSession(cookie);

    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('GET /session returns 401 for a tampered cookie', async () => {
    const cookie = sessionCookie(await login({ username: 'admin', password: 'admin123' }));

    const response = await getSession(`${cookie.slice(0, -4)}AAAA`);

    expect(response.status).toBe(401);
  });

  it('GET /session still returns 200 just before 5 minutes have passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const cookie = sessionCookie(await login({ username: 'admin', password: 'admin123' }));

    vi.setSystemTime(Date.now() + (SESSION_TTL_SECONDS - 1) * 1000);
    const response = await getSession(cookie);

    expect(response.status).toBe(200);
  });

  it('GET /session returns 401 once 5 minutes have passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const cookie = sessionCookie(await login({ username: 'admin', password: 'admin123' }));

    vi.setSystemTime(Date.now() + (SESSION_TTL_SECONDS + 1) * 1000);
    const response = await getSession(cookie);

    expect(response.status).toBe(401);
  });

  it('a session sealed with a different secret is rejected', async () => {
    const other = await startServer({
      port: 0,
      users: repo,
      credentials: inMemoryCredentialStore,
      session: { ...SESSION, secret: 'another-session-secret-of-32-characters!' },
    });
    try {
      const cookie = sessionCookie(
        await fetch(new URL('/login', other.url), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'admin', password: 'admin123' }),
        }),
      );

      expect((await getSession(cookie)).status).toBe(401);
    } finally {
      await other.stop();
    }
  });

  it('refuses to start with a session secret shorter than 32 characters', async () => {
    await expect(
      startServer({
        port: 0,
        users: repo,
        credentials: inMemoryCredentialStore,
        session: { secret: 'too-short', secure: false },
      }),
    ).rejects.toThrow(/32 characters/);
  });
});
