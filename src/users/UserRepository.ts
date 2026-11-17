import type { CreateUserInput, UpdateUserInput, User } from './User.ts';

/**
 * Storage abstraction for users. Resolvers depend only on this interface,
 * so the in-memory implementation can later be swapped for a database one.
 */
export interface UserRepository {
  list(): Promise<User[]>;
  getById(id: string): Promise<User | null>;
  /** Adds a user with a generated id and timestamps. */
  create(input: CreateUserInput): Promise<User>;
  /** Applies a partial update. Resolves to `null` if no user has this id. */
  update(id: string, input: UpdateUserInput): Promise<User | null>;
}
