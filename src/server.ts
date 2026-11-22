import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@as-integrations/express5';
import cors from 'cors';
import express from 'express';
import type { AppContext } from './context.ts';
import { resolvers } from './schema/resolvers.ts';
import { typeDefs } from './schema/typeDefs.ts';
import type { UserRepository } from './users/UserRepository.ts';

export const GRAPHQL_PATH = '/graphql';

export interface ServerOptions {
  /** Port to listen on; 0 picks a free port. */
  port: number;
  /** Shared by every request, so changes persist between requests. */
  users: UserRepository;
}

export interface RunningServer {
  /** Full URL of the GraphQL endpoint, e.g. http://localhost:4000/graphql */
  url: string;
  stop: () => Promise<void>;
}

export async function startServer({ port, users }: ServerOptions): Promise<RunningServer> {
  const app = express();
  const httpServer = http.createServer(app);

  const server = new ApolloServer<AppContext>({
    typeDefs,
    resolvers,
    // Lets server.stop() close open connections before resolving.
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  });
  await server.start();

  app.use(
    GRAPHQL_PATH,
    // Any origin for now, same as startStandaloneServer. Restrict this before using cookies.
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server, {
      context: async () => ({ users }),
    }),
  );

  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen({ port }, resolve);
    });
  } catch (error) {
    await server.stop();
    throw error;
  }

  const { port: actualPort } = httpServer.address() as AddressInfo;
  return {
    url: `http://localhost:${actualPort}${GRAPHQL_PATH}`,
    stop: () => server.stop(),
  };
}
