import { randomUUID } from 'node:crypto';
import type { CredentialStore } from './CredentialStore.ts';
import { hashPassword, verifyPassword } from './password.ts';

/**
 * A login. Deliberately unrelated to `User` in `src/users/`: a credential is
 * who may log in, not a record in the user list.
 */
interface Credential {
  username: string;
  /** Output of `hashPassword`. The plaintext password is never stored. */
  passwordHash: string;
}

/**
 * Hardcoded logins for development. Only hashes are stored here, never
 * plaintext. Add one with: npm run hash-password -- <password>
 */
const credentials: readonly Credential[] = [
  {
    username: 'admin',
    passwordHash:
      'scrypt$fTnJwCBhlmEB1xwRexwHTg$dUnvQHgJ0_X-64CieNp9LPkMnPoYOxzo0Qkds6i3xu9t8zftydWa5TG7_cbtKGOxptIgrpL_hWA57W5K8uIOHQ',
  },
  {
    username: 'demo',
    passwordHash:
      'scrypt$cJl50lLkuUIbptUHCsw-zw$SpLTxKWC0YSqDInEGbhtUyYE6WDtlqiXWBQPCvc9stv0rN8QjjWNZaB_zWrHMRdD73avEyRdJ0I3T1mcZx9xwQ',
  },
];

const hashes = new Map(credentials.map(({ username, passwordHash }) => [username, passwordHash]));

/**
 * Verified against when the username is unknown, so that a wrong username
 * takes as long as a wrong password and response times don't reveal which
 * usernames exist. Its password is random and never known.
 */
const dummyHash = hashPassword(randomUUID());

export const inMemoryCredentialStore: CredentialStore = {
  async verify(username, password) {
    const stored = hashes.get(username);
    const matches = await verifyPassword(password, stored ?? (await dummyHash));
    return stored !== undefined && matches;
  },
};
