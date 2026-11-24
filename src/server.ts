import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@as-integrations/express5';
import cors from 'cors';
import express from 'express';
import { createAuthRouter } from './auth/authRouter.ts';
import { requireSession } from './auth/requireSession.ts';
import type { CredentialStore } from './auth/CredentialStore.ts';
import { createSessionReader, type SessionConfig } from './auth/session.ts';
import type { AppContext } from './context.ts';
import { resolvers } from './schema/resolvers.ts';
import { typeDefs } from './schema/typeDefs.ts';
import type { UserRepository } from './users/UserRepository.ts';

export const GRAPHQL_PATH = '/graphql';
/** Prefix of every REST route. */
export const API_PATH = '/api';

export interface ServerOptions {
  /** Port to listen on; 0 picks a free port. */
  port: number;
  /** Shared by every request, so changes persist between requests. */
  users: UserRepository;
  /** Checked by POST /api/login. */
  credentials: CredentialStore;
  /** Session cookie settings for the auth routes and the session check on /graphql. */
  session: SessionConfig;
}

export interface RunningServer {
  /** Full URL of the GraphQL endpoint, e.g. http://localhost:4000/graphql */
  url: string;
  stop: () => Promise<void>;
}

export async function startServer({
  port,
  users,
  credentials,
  session,
}: ServerOptions): Promise<RunningServer> {
  // Created first: it throws on a bad session secret before anything starts.
  const getSession = createSessionReader(session);
  const authRouter = createAuthRouter(credentials, getSession);

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
    // Any origin, without credentials. The UI reaches /graphql same-origin through its Vite proxy.
    // Before the session check, so CORS preflights (which carry no cookie) are answered.
    cors<cors.CorsRequest>(),
    requireSession(getSession),
    express.json(),
    expressMiddleware(server, {
      // requireSession has already rejected requests without a session.
      context: async ({ res }) => ({ users, username: res.locals.username as string }),
    }),
  );

  // POST /api/login and GET /api/session. No CORS: the UI reaches them same-origin through its Vite proxy.
  app.use(API_PATH, authRouter);

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
