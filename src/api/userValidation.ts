import { GraphQLError } from 'graphql';
import type * as Gql from '../schema/__generated__/types.ts';

declare const validated: unique symbol;

/** Type-only mark. Only this file adds it, so the mapper cannot be given unvalidated input. */
export type Validated<T> = T & { readonly [validated]: true };

/** Update input after validation: fields may be omitted, but are never null. */
export type ValidUpdateUserInput = {
  [K in keyof Gql.UpdateUserInput]?: NonNullable<Gql.UpdateUserInput[K]>;
};

type UserField = keyof Gql.CreateUserInput;

// An object rather than an array, so typecheck fails when the schema gains or loses an input field.
// Key order is validation order.
const UPDATE_FIELDS = {
  firstName: true,
  lastName: true,
  email: true,
  role: true,
} satisfies Record<keyof Gql.UpdateUserInput, true>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function markValidated<T>(value: T): Validated<T> {
  return value as Validated<T>;
}

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

export function parseCreateUserInput(input: Gql.CreateUserInput): Validated<Gql.CreateUserInput> {
  const result = {
    firstName: parseField('firstName', input.firstName),
    lastName: parseField('lastName', input.lastName),
    email: parseField('email', input.email),
    role: parseField('role', input.role),
  } satisfies Record<keyof Gql.CreateUserInput, unknown>;
  return markValidated(result);
}

export function parseUpdateUserInput(input: Gql.UpdateUserInput): Validated<ValidUpdateUserInput> {
  const result: ValidUpdateUserInput = {};
  for (const field of Object.keys(UPDATE_FIELDS) as (keyof typeof UPDATE_FIELDS)[]) {
    const value = input[field];
    if (value === undefined) continue;
    if (value === null) {
      throw badInput(field, `${field} cannot be null`);
    }
    result[field] = parseField(field, value);
  }
  return markValidated(result);
}
