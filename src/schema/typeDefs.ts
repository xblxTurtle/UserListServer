import { readFileSync } from 'node:fs';

export const typeDefs = readFileSync(new URL('./typeDefs.graphql', import.meta.url), 'utf8');
