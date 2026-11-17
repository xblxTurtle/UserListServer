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

try {
  const port = parsePort(process.env.PORT);
  const users = new InMemoryUserRepository(seedUsers);
  const { url } = await startServer({ port, users });
  console.log(`GraphQL server ready at ${url}`);
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}
