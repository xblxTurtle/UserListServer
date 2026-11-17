# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the backend of a full-stack "user list" app: a GraphQL API built with Apollo Server 5 and `graphql` 16, written in TypeScript. Clients can list users, get one user, create a user and update a user. Data is kept in memory and resets to the seed data on every restart. A database will replace the in-memory store later. The frontend lives in the sibling `../UserListUI`.

## Commands

Node version is pinned in `.nvmrc` (v22.23.2). Run `nvm use` first.

- `npm run dev`: start the server with `node --watch` on `http://localhost:4000/` (Apollo Sandbox opens there in a browser)
- `npm start`: start the server without watch
- `npm test`: run all Vitest tests once
- `npm run typecheck`: `tsc --noEmit`

`PORT` overrides the default port 4000. An invalid value stops startup with exit code 1.

## TypeScript without a build step

Node 22.18+ runs `.ts` files directly by stripping types. There is no `tsx`, no build and no `dist/`. `tsc` only type-checks, because Node never checks types. This means:

- Only erasable syntax is allowed: no `enum`, `namespace` or constructor parameter properties (`erasableSyntaxOnly`).
- Imports use explicit `.ts` extensions (`allowImportingTsExtensions`).
- Type-only imports must use `import type` (`verbatimModuleSyntax`).
- No tsconfig `paths` aliases. Imports stay relative.
- `noUnusedLocals` and `noUnusedParameters` are on. Prefix unused resolver parameters with `_`.

## Structure

- `src/index.ts`: entry point. Reads `PORT`, creates one `InMemoryUserRepository(seedUsers)` and calls `startServer`.
- `src/server.ts`: `startServer({ port, users })` wraps `startStandaloneServer` and returns `{ url, stop }`. The `context` function hands the same repository to every request.
- `src/context.ts`: `AppContext`, which is `{ users: UserRepository }`.
- `src/schema/typeDefs.graphql`: the schema (SDL). `typeDefs.ts` reads it from disk once at startup.
- `src/schema/resolvers.ts`: thin resolvers. They validate input, call the repository from the context and turn a missing user into an error.
- `src/users/`:
  - `User.ts`: the `User`, `CreateUserInput` and `UpdateUserInput` types.
  - `UserRepository.ts`: the async storage interface (`list`, `getById`, `create`, `update`).
  - `InMemoryUserRepository.ts`: implements it with a `Map`.
  - `validation.ts`: `parseCreateUserInput` and `parseUpdateUserInput`.
  - `seed.ts`: 10 sample users.

Resolvers depend only on the `UserRepository` interface. To add a database, write another implementation and pass it to `startServer` in `index.ts`. The schema, resolvers and tests stay the same.

## Data rules

- Every `User` field is required and never `null`, including `role`. In the schema they are all non-null (`String!` / `ID!`).
- `role` is free text, not an enum.
- Emails do not have to be unique.
- Ids are UUIDs. New users get `randomUUID()`. Seed users have fixed UUID literals, so their ids stay the same across restarts. Do not generate seed ids at runtime.
- `createdAt` and `updatedAt` are ISO 8601 strings. `update` always sets a new `updatedAt`, even when the input is empty.
- The repository returns copies, never stored objects, so callers cannot change the store by accident.
- `update` changes only the fields that were provided. A field set to `undefined` is skipped.

## Validation and errors

- `UpdateUserInput` fields are nullable in the schema only so they can be left out, because GraphQL cannot express "optional but never null". The resolver rejects an explicit `null`.
- `parseCreateUserInput` and `parseUpdateUserInput` trim all values and lowercase emails. They reject blank names or roles and emails that do not match `x@y.z`.
- Every validation failure is a `GraphQLError` with `extensions: { code: 'BAD_USER_INPUT', field }`.
- `updateUser` on an unknown id fails with `NOT_FOUND`. `user(id)` on an unknown id returns `null` and no error.
- Validation runs before the repository is called, so failed requests never change data.

## Tests

- Tests sit next to their source as `*.test.ts`, which Vitest finds by default with no config file.
- `src/users/InMemoryUserRepository.test.ts`: tests the repository directly.
- `src/schema/resolvers.test.ts`: runs real operations through `ApolloServer.executeOperation` with a new repository per test. Narrow the result with `assert(response.body.kind === 'single')`.
- `src/server.test.ts`: starts a real server per test with `startServer({ port: 0, ... })` and sends requests with `fetch`. It covers HTTP status codes, CORS and the context.
- New behavior is written test-first: add the tests, confirm they fail, then implement.

## Known limitations

- Resolver argument types are written by hand. `graphql-codegen` would generate them from the schema.
- `startStandaloneServer` lets any origin call the server and cannot be configured. Switch to `expressMiddleware` to restrict origins or use cookies.
- `users` has no pagination yet.
- `npm audit` reports one high-severity issue in `@graphql-tools/utils`, which comes in through `@apollo/server`. It affects `@defer` result merging, which this API does not use. A non-breaking `npm audit fix` is available but has not been run.
