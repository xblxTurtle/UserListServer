import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import type { AppContext } from './context.ts';
import { resolvers } from './schema/resolvers.ts';
import { typeDefs } from './schema/typeDefs.ts';
import type { UserRepository } from './users/UserRepository.ts';

export interface ServerOptions {
  /** Port to listen on; 0 picks a free port. */
  port: number;
  /** Shared by every request, so changes persist between requests. */
  users: UserRepository;
}

export interface RunningServer {
  url: string;
  stop: () => Promise<void>;
}

export async function startServer({ port, users }: ServerOptions): Promise<RunningServer> {
  const server = new ApolloServer<AppContext>({ typeDefs, resolvers });

  const { url } = await startStandaloneServer(server, {
    context: async () => ({ users }),
    listen: { port },
  });

  return { url, stop: () => server.stop() };
}
