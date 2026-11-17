import { GraphQLError } from 'graphql';
import type { CreateUserInput, UpdateUserInput } from './User.ts';

type UserField = keyof CreateUserInput;

/** Update input as GraphQL delivers it: fields may be missing or explicitly null. */
export type RawUpdateUserInput = { [K in UserField]?: string | null };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function badInput(field: UserField, message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'BAD_USER_INPUT', field },
  });
}

function parseField(field: UserField, value: string): string {
  const trimmed = value.trim();
  if (field === 'email') {
    const email = trimmed.toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      throw badInput(field, 'email must be a valid email address');
    }
    return email;
  }
  if (trimmed === '') {
    throw badInput(field, `${field} cannot be blank`);
  }
  return trimmed;
}

export function parseCreateUserInput(input: CreateUserInput): CreateUserInput {
  return {
    firstName: parseField('firstName', input.firstName),
    lastName: parseField('lastName', input.lastName),
    email: parseField('email', input.email),
    role: parseField('role', input.role),
  };
}

export function parseUpdateUserInput(input: RawUpdateUserInput): UpdateUserInput {
  const result: UpdateUserInput = {};
  for (const field of ['firstName', 'lastName', 'email', 'role'] as const) {
    const value = input[field];
    if (value === undefined) continue;
    if (value === null) {
      throw badInput(field, `${field} cannot be null`);
    }
    result[field] = parseField(field, value);
  }
  return result;
}
