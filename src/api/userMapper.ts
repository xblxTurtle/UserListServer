import type * as Gql from '../schema/__generated__/types.ts';
import type * as Model from '../users/User.ts';
import type { Validated, ValidUpdateUserInput } from './userValidation.ts';

// The only place where schema types meet model types. List every field, never spread.

export function toGqlUser(user: Model.User): Gql.User {
  return {
    __typename: 'User',
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function fromGqlCreateInput(input: Validated<Gql.CreateUserInput>): Model.CreateUserInput {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    role: input.role,
  } satisfies Record<keyof Gql.CreateUserInput, unknown>;
}

export function fromGqlUpdateInput(input: Validated<ValidUpdateUserInput>): Model.UpdateUserInput {
  // Annotated, because TypeScript cannot check for unknown model fields through omitUndefined.
  const update: Model.UpdateUserInput = {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    role: input.role,
  } satisfies Record<keyof Gql.UpdateUserInput, unknown>;
  return omitUndefined(update);
}

/** An omitted field must stay omitted: a database might write `undefined` as NULL. */
function omitUndefined<T extends object>(value: T): Partial<T> {
  const entries = Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined);
  return Object.fromEntries(entries) as Partial<T>;
}
