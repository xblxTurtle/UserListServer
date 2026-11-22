import { GraphQLError } from 'graphql';
import { fromGqlCreateInput, fromGqlUpdateInput, toGqlUser } from '../api/userMapper.ts';
import { parseCreateUserInput, parseUpdateUserInput } from '../api/userValidation.ts';
import type { MutationResolvers, QueryResolvers, Resolvers } from './__generated__/types.ts';

/** Generated resolver keys are optional, so require every operation in the schema. */
type AppResolvers = Resolvers & {
  Query: Required<QueryResolvers>;
  Mutation: Required<MutationResolvers>;
};

export const resolvers = {
  Query: {
    users: async (_parent, _args, ctx) => {
      const users = await ctx.users.list();
      return users.map(toGqlUser);
    },

    user: async (_parent, args, ctx) => {
      const user = await ctx.users.getById(args.id);
      return user && toGqlUser(user);
    },
  },

  Mutation: {
    createUser: async (_parent, args, ctx) => {
      const valid = parseCreateUserInput(args.input);
      const created = await ctx.users.create(fromGqlCreateInput(valid));
      return toGqlUser(created);
    },

    updateUser: async (_parent, args, ctx) => {
      const valid = parseUpdateUserInput(args.input);
      const updated = await ctx.users.update(args.id, fromGqlUpdateInput(valid));
      if (!updated) {
        throw new GraphQLError(`User ${args.id} not found`, {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return toGqlUser(updated);
    },
  },
} satisfies AppResolvers;
