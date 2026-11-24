import type { UserRepository } from './users/UserRepository.ts';

/** Shared by all resolvers during one GraphQL operation. */
export interface AppContext {
  users: UserRepository;
  /** The logged-in user. Always set: `/graphql` rejects requests without a session before any resolver runs. */
  username: string;
}
