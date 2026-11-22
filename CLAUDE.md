# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the backend of a full-stack "user list" app: a GraphQL API built with Apollo Server 5 and `graphql` 16, written in TypeScript. Clients can list users, get one user, create a user and update a user. Data is kept in memory and resets to the seed data on every restart. A database will replace the in-memory store later. The frontend lives in the sibling `../UserListUI`.

## Commands

Node version is pinned in `.nvmrc` (v22.23.2). Run `nvm use` first.

- `npm run dev`: start the server with GraphQL at `http://localhost:4000/graphql` (Apollo Sandbox opens there in a browser) and restart it on any change under `src/`, `.graphql` included. Uses `node --watch-path`, which Node 22 supports only on macOS and Windows. On Linux, use `npm start` or `node --watch src/index.ts` (which misses `.graphql` edits)
- `npm start`: start the server without watch
- `npm test`: run all Vitest tests once
- `npm run codegen`: regenerate types after editing `typeDefs.graphql`
- `npm run codegen:check`: fail, without writing, if the generated types are out of date
- `npm run typecheck`: `codegen:check`, then `tsc --noEmit`

`PORT` overrides the default port 4000. An invalid value stops startup with exit code 1.

## TypeScript without a build step

Node 22.18+ runs `.ts` files directly by stripping types. There is no `tsx`, no build and no `dist/`. `tsc` only type-checks, because Node never checks types. This means:

- Only erasable syntax is allowed: no `enum`, `namespace` or constructor parameter properties (`erasableSyntaxOnly`).
- Imports use explicit `.ts` extensions (`allowImportingTsExtensions`).
- Type-only imports must use `import type` (`verbatimModuleSyntax`).
- No tsconfig `paths` aliases. Imports stay relative.
- `noUnusedLocals` and `noUnusedParameters` are on. Prefix unused resolver parameters with `_`.

## Schema-first, with separate API and storage models

`src/schema/typeDefs.graphql` is the source of truth for the API. `src/users/User.ts` is the storage model. They are independent, and only `src/api/userMapper.ts` converts between them:

- `src/schema/` uses the generated schema types. Resolvers never import from `src/users/`. They get model values from the repository and convert them before returning, and `codegen.ts` has no `mappers` pointing at models.
- `src/users/` uses model types. Data from the API is already valid when it becomes a model type. It never imports generated types, the `graphql` package or anything from `src/api/`.
- `src/api/` holds the boundary helpers that resolvers call:
  - `userValidation.ts` validates GraphQL input. It knows schema types only, never model types.
  - `userMapper.ts` only converts between the two, and its types are the drift check. It has no business rules, and accepts input only after validation.

Each resolver runs the steps it needs in this order: validate the input (`parse*Input`), convert it (`fromGql*Input`), call the repository, convert the result (`toGqlUser`). Keep the logic of each step in `src/api/`: resolvers only call it. There is deliberately no service layer between resolvers and the repository, because it would only repeat the resolvers.

To change the API:

1. Edit `typeDefs.graphql`.
2. Run `npm run codegen`. Never edit `src/schema/__generated__/types.ts`. Commit it with the schema change.
3. Run `npm run typecheck` and fix what it reports. `npm test` does not check types.

What enforces the separation (do not remove it to silence a type error):

- `nonOptionalTypename` in `codegen.ts`: only the mapper adds `__typename`, so returning an unconverted model is a type error.
- `avoidOptionals.field`: the mapper must set every schema field, nullable ones too.
- `satisfies Record<keyof Gql.*Input, unknown>` in the mapper and the validator (`UPDATE_FIELDS` for updates): every input field must be handled.
- `Validated<T>`: only `userValidation.ts` creates it and the mapper requires it, so converting unvalidated input is a type error. Never cast to it elsewhere.
- `satisfies AppResolvers` in `resolvers.ts`: every Query and Mutation must have a resolver. Never write resolver argument or return types by hand.

List every field in the mapper and never spread. A storage-only column then stays out of the API with no other change.

## Structure

- `src/index.ts`: entry point. Reads `PORT`, creates one `InMemoryUserRepository(seedUsers)` and calls `startServer`.
- `src/server.ts`: `startServer({ port, users })` builds an Express 5 app, mounts Apollo at `/graphql` (`GRAPHQL_PATH`) with `cors()`, `express.json()` and `expressMiddleware` from `@as-integrations/express5`, and returns `{ url, stop }`. `url` is the full GraphQL endpoint. `ApolloServerPluginDrainHttpServer` makes `stop()` close the HTTP server too. The `context` function hands the same repository to every request. Other paths return Express's 404. Add non-GraphQL routes (such as auth) to the same `app`.
- `src/context.ts`: `AppContext`, which is `{ users: UserRepository }`.
- `src/schema/typeDefs.graphql`: the schema (SDL). `typeDefs.ts` reads it from disk once at startup.
- `src/schema/__generated__/types.ts`: generated API types.
- `src/schema/resolvers.ts`: thin resolvers. They validate and convert input, call the repository from the context, convert the result and turn a missing user into an error.
- `src/api/userValidation.ts`: `parseCreateUserInput` and `parseUpdateUserInput`.
- `src/api/userMapper.ts`: converts between API types and model types.
- `src/users/`:
  - `User.ts`: the `User`, `CreateUserInput` and `UpdateUserInput` types.
  - `UserRepository.ts`: the async storage interface (`list`, `getById`, `create`, `update`).
  - `InMemoryUserRepository.ts`: implements it with a `Map`.
  - `seed.ts`: 10 sample users.

Resolvers depend only on the `UserRepository` interface. To add a database, write another implementation and pass it to `startServer` in `index.ts`. The schema and resolvers stay the same. If the stored shape changes, update `User.ts` and the mapper.

## Data rules

- Every `User` field is required and never `null`, including `role`. In the schema they are all non-null (`String!` / `ID!`).
- `role` is free text, not an enum.
- Emails do not have to be unique.
- Ids are UUIDs. New users get `randomUUID()`. Seed users have fixed UUID literals, so their ids stay the same across restarts. Do not generate seed ids at runtime.
- `createdAt` and `updatedAt` are ISO 8601 strings. `update` always sets a new `updatedAt`, even when the input is empty.
- The repository returns copies, never stored objects, so callers cannot change the store by accident.
- `update` changes only the fields that were provided. A field set to `undefined` is skipped. The mapper also leaves omitted fields out entirely (`omitUndefined`), because a database might write `undefined` as NULL.

## Validation and errors

- `UpdateUserInput` fields are nullable in the schema only so they can be left out, because GraphQL cannot express "optional but never null". `parseUpdateUserInput` rejects an explicit `null`.
- `parseCreateUserInput` and `parseUpdateUserInput` trim all values and lowercase emails. They reject blank names or roles and emails that do not match `x@y.z`.
- Every validation failure is a `GraphQLError` with `extensions: { code: 'BAD_USER_INPUT', field }`.
- `updateUser` on an unknown id fails with `NOT_FOUND`. `user(id)` on an unknown id returns `null` and no error.
- Validation runs on GraphQL input, before conversion and before the repository is called, so failed requests never change data.

## Tests

- Tests sit next to their source as `*.test.ts`, which Vitest finds by default with no config file.
- `src/users/InMemoryUserRepository.test.ts`: tests the repository directly.
- `src/api/userMapper.test.ts`: tests the conversions, including that storage-only and omitted fields are dropped. Its `@ts-expect-error` lines are checked by `npm run typecheck`, not by `npm test`.
- `src/schema/resolvers.test.ts`: runs real operations through `ApolloServer.executeOperation` with a new repository per test. Narrow the result with `assert(response.body.kind === 'single')`. It also checks what reaches the repository, and calls resolvers directly to check that results are converted.
- `src/server.test.ts`: starts a real server per test with `startServer({ port: 0, ... })` and sends requests with `fetch`. It covers HTTP status codes, routing (`/graphql` only), CORS and the context.
- New behavior is written test-first: add the tests, confirm they fail, then implement.

## Known limitations

- CORS allows any origin (`cors()` with no options). Restrict `origin` (and set `credentials: true`) before using cookies.
- Typecheck cannot catch these changes, so check them by hand and with tests:
  - a new optional argument that a resolver ignores, or any new argument on a `User` field (a required operation argument is caught only by the direct resolver calls in `resolvers.test.ts`);
  - a new Subscription type, until it is added to `AppResolvers`;
  - a result or `User` field made nullable (the existing code stays type-correct);
  - a resolver that passes raw create input, or validated but unconverted input, straight to the repository while the API and model shapes are identical.
- A relation such as `User.team` will need its own parent type in codegen (not a storage model), or `toGqlUser` would have to load it eagerly.
- Validation is API-only: seed data and any other caller of the repository are not validated. When a second writer appears (an import job, a REST route), move the business rules (email format, not blank) into `src/users/` and keep the GraphQL-only ones (rejecting null) in `src/api/`.
- `users` has no pagination yet.
- `npm audit` reports one high-severity issue in `@graphql-tools/utils`, which comes in through `@apollo/server`. It affects `@defer` result merging, which this API does not use. A non-breaking `npm audit fix` is available but has not been run.
- `npm audit` also reports three moderate, dev-only `minimatch` advisories through `@graphql-codegen/cli`. Do not run `npm audit fix --force`: it downgrades the CLI to v5.
