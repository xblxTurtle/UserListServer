/**
 * Storage abstraction for login credentials. The auth routes depend only on
 * this interface, so the in-memory implementation can later be swapped.
 */
export interface CredentialStore {
  /** Resolves to `true` only if the username exists and the password matches. */
  verify(username: string, password: string): Promise<boolean>;
}
