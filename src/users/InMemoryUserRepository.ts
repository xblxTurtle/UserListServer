import { randomUUID } from 'node:crypto';
import type { CreateUserInput, UpdateUserInput, User } from './User.ts';
import type { UserRepository } from './UserRepository.ts';

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  constructor(seed: readonly User[] = []) {
    for (const user of seed) {
      this.users.set(user.id, { ...user });
    }
  }

  async list(): Promise<User[]> {
    return [...this.users.values()].map((user) => ({ ...user }));
  }

  async getById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date().toISOString();
    const user: User = {
      id: randomUUID(),
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return { ...user };
  }

  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const existing = this.users.get(id);
    if (!existing) {
      return null;
    }

    // Copy only fields that were actually provided, so an explicit
    // `undefined` never overwrites a stored value.
    const patch: UpdateUserInput = {};
    if (input.firstName !== undefined) patch.firstName = input.firstName;
    if (input.lastName !== undefined) patch.lastName = input.lastName;
    if (input.email !== undefined) patch.email = input.email;
    if (input.role !== undefined) patch.role = input.role;

    const updated: User = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.users.set(id, updated);
    return { ...updated };
  }
}
