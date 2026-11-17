export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  /** ISO 8601 timestamp */
  createdAt: string;
  /** ISO 8601 timestamp */
  updatedAt: string;
}

/** Fields a client provides when creating a user; id and timestamps are generated. */
export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

/** Partial patch: omitted fields are left unchanged. No field accepts `null`. */
export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}
