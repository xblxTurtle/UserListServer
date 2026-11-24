// Prints a password hash for src/auth/inMemoryCredentialStore.ts.
// Usage: npm run hash-password -- <password>
import { hashPassword } from '../src/auth/password.ts';

const password = process.argv[2];
if (password === undefined || password === '') {
  console.error('Usage: npm run hash-password -- <password>');
  process.exit(1);
}
console.log(await hashPassword(password));
