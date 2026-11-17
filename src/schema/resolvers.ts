import { GraphQLError } from 'graphql';
import type { AppContext } from '../context.ts';
import type { CreateUserInput, User } from '../users/User.ts';
import {
  parseCreateUserInput,
  parseUpdateUserInput,
  type RawUpdateUserInput,
} from '../users/validation.ts';

export const resolvers = {
  Query: {
    users: (_parent: unknown, _args: unknown, ctx: AppContext): Promise<User[]> =>
      ctx.users.list(),

    user: (_parent: unknown, args: { id: string }, ctx: AppContext): Promise<User | null> =>
      ctx.users.getById(args.id),
  },

  Mutation: {
    createUser: (
      _parent: unknown,
      args: { input: CreateUserInput },
      ctx: AppContext,
    ): Promise<User> => ctx.users.create(parseCreateUserInput(args.input)),

    updateUser: async (
      _parent: unknown,
      args: { id: string; input: RawUpdateUserInput },
      ctx: AppContext,
    ): Promise<User> => {
      const input = parseUpdateUserInput(args.input);
      const updated = await ctx.users.update(args.id, input);
      if (!updated) {
        throw new GraphQLError(`User ${args.id} not found`, {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return updated;
    },
  },
};
