import type { UserRepository } from './users/UserRepository.ts';

/** Shared by all resolvers during one GraphQL operation. */
export interface AppContext {
  users: UserRepository;
}
