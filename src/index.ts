import { inMemoryCredentialStore } from './auth/inMemoryCredentialStore.ts';
import { startServer } from './server.ts';
import { InMemoryUserRepository } from './users/InMemoryUserRepository.ts';
import { seedUsers } from './users/seed.ts';

const DEFAULT_PORT = 4000;

function parsePort(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer from 0 to 65535, got "${value}"`);
  }
  return port;
}

// Development only: anyone with the source can forge sessions with it.
const DEV_SESSION_SECRET = 'dev-only-session-secret-do-not-use-in-production';

function readSessionSecret(value: string | undefined, production: boolean): string {
  if (value !== undefined && value !== '') return value;
  if (production) throw new Error('SESSION_SECRET must be set in production');
  console.warn('SESSION_SECRET is not set; using an insecure development secret.');
  return DEV_SESSION_SECRET;
}

try {
  const port = parsePort(process.env.PORT);
  const users = new InMemoryUserRepository(seedUsers);
  const production = process.env.NODE_ENV === 'production';
  const session = {
    secret: readSessionSecret(process.env.SESSION_SECRET, production),
    // Browsers drop Secure cookies over plain HTTP, so only require HTTPS in production.
    secure: production,
  };
  const { url } = await startServer({ port, users, credentials: inMemoryCredentialStore, session });
  console.log(`GraphQL server ready at ${url}`);
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}
