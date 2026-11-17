import type { User } from './User.ts';

const createdAt = '2026-01-15T09:00:00.000Z';

function user(id: string, firstName: string, lastName: string, role: string): User {
  return {
    id,
    firstName,
    lastName,
    email: `${firstName}.${lastName}@example.com`.toLowerCase(),
    role,
    createdAt,
    updatedAt: createdAt,
  };
}

export const seedUsers: readonly User[] = [
  user('0698ae11-d8d0-4227-b40f-3d121059462d', 'Alice', 'Johnson', 'admin'),
  user('33b1cf43-e822-44d6-bfab-d1150dfccdb1', 'Bob', 'Smith', 'editor'),
  user('36d0dca3-4ae6-422b-b58d-4cbb349e2d40', 'Carol', 'Williams', 'viewer'),
  user('a8802ab3-ca36-437a-83a7-dc0086e53556', 'David', 'Brown', 'editor'),
  user('73a0e7e9-7336-4c24-82e9-c07f0b4e903e', 'Eva', 'Martinez', 'viewer'),
  user('bd6a517d-b332-4496-9d80-524e400f8975', 'Frank', 'Garcia', 'viewer'),
  user('34ea0cdf-cf72-48e6-a56d-3d8ebc563090', 'Grace', 'Lee', 'admin'),
  user('1002f6c4-d5b8-4782-b169-9835d411d8c2', 'Henry', 'Wilson', 'viewer'),
  user('7ead75ca-59a3-4bbe-b86c-c4cd0d5faca9', 'Irene', 'Taylor', 'viewer'),
  user('530a4b81-a950-467d-8307-5975ee808936', 'Jack', 'Anderson', 'editor'),
];
