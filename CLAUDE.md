# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the backend of a full-stack "user list" app: a GraphQL API built with Apollo Server 5 and `graphql` 16, written in TypeScript. Clients can list users, get one user, create a user and update a user. Two REST routes, `POST /api/login` and `GET /api/session`, handle authentication with an encrypted session cookie (iron-session). `/graphql` requires that session. Data is kept in memory and resets to the seed data on every restart. A database will replace the in-memory store later. The frontend lives in the sibling `../UserListUI`.

## Commands

Node version is pinned in `.nvmrc` (v22.23.2). Run `nvm use` first.

- `npm run dev`: start the server with GraphQL at `http://localhost:4000/graphql` (Apollo Sandbox opens there in a browser) and restart it on any change under `src/`, `.graphql` included. Uses `node --watch-path`, which Node 22 supports only on macOS and Windows. On Linux, use `npm start` or `node --watch src/index.ts` (which misses `.graphql` edits)
- `npm start`: start the server without watch
- `npm test`: run all Vitest tests once
- `npm run codegen`: regenerate types after editing `typeDefs.graphql`
- `npm run codegen:check`: fail, without writing, if the generated types are out of date
- `npm run typecheck`: `codegen:check`, then `tsc --noEmit` (covers `src/` and `scripts/`)
- `npm run hash-password -- <password>`: print a hash to paste into the list in `src/auth/inMemoryCredentialStore.ts`

Environment variables:

- `PORT` overrides the default port 4000. An invalid value stops startup with exit code 1.
- `SESSION_SECRET` encrypts the session cookie and must be at least 32 characters, or startup fails. When it is unset, a fixed development secret is used and a warning is printed. With `NODE_ENV=production` it is required.
- `NODE_ENV=production` also marks the cookie `Secure`. Otherwise it is not, because browsers drop `Secure` cookies over plain-HTTP localhost.

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

- `src/index.ts`: entry point. Reads `PORT`, `SESSION_SECRET` and `NODE_ENV`, creates one `InMemoryUserRepository(seedUsers)` and calls `startServer` with it and `inMemoryCredentialStore`.
- `src/server.ts`: `startServer({ port, users, credentials, session })` builds an Express 5 app, mounts Apollo at `/graphql` (`GRAPHQL_PATH`) with `cors()`, `requireSession`, `express.json()` and `expressMiddleware` from `@as-integrations/express5`, and returns `{ url, stop }`. `url` is the full GraphQL endpoint. `ApolloServerPluginDrainHttpServer` makes `stop()` close the HTTP server too. The `context` function hands the same repository to every request, plus the `username` that `requireSession` put in `res.locals`. It creates one `createSessionReader(session)` and gives it to both the auth router and `requireSession`. It also mounts the auth router under `/api` (`API_PATH`). Every REST route lives under `/api`, so mount new routers there too. Other paths return Express's 404.
- `src/context.ts`: `AppContext`, which is `{ users: UserRepository; username: string }`. `username` is always set, because requests without a session never reach a resolver.
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
- `src/auth/`: login and sessions. It is separate from `src/users/` and must never import from it: a credential is who may log in, not a user in the list.
  - `CredentialStore.ts`: the async interface, `verify(username, password): Promise<boolean>`.
  - `inMemoryCredentialStore.ts`: the hardcoded logins (`{ username, passwordHash }`) and the store, in one module. The logins are stored as precomputed hashes only, with no plaintext passwords in source. The store is a plain object, `inMemoryCredentialStore`, that implements `CredentialStore` over a `Map`. For an unknown username it still verifies against a dummy hash, so response times don't reveal which usernames exist.
  - `password.ts`: `hashPassword` and `verifyPassword`, using async `node:crypto` scrypt with a random salt, stored as `scrypt$<salt>$<hash>` (base64url) and compared with `timingSafeEqual`. A malformed hash verifies as `false` and never throws.
  - `session.ts`: `SessionData` (`{ username? }`), `SessionConfig` (`{ secret, secure }`), `sessionOptions()`, which rejects secrets under 32 characters, and `createSessionReader(config)`, which returns the `(req, res) => session` function everything else uses.
  - `requireSession.ts`: Express middleware for `/graphql`, described under Auth rules.
  - `authRouter.ts`: `createAuthRouter(credentials, getSession)`, where `getSession` comes from `createSessionReader`. Its routes are relative (`/login`, `/session`), and `server.ts` mounts it under `/api`. `express.json()` is applied to `/login` only.
- `scripts/hash-password.ts`: CLI behind `npm run hash-password`.

Resolvers depend only on the `UserRepository` interface. To add a database, write another implementation and pass it to `startServer` in `index.ts`. The schema and resolvers stay the same. If the stored shape changes, update `User.ts` and the mapper.

## Data rules

- Every `User` field is required and never `null`, including `role`. In the schema they are all non-null (`String!` / `ID!`).
- `role` is free text, not an enum.
- Emails do not have to be unique.
- Ids are UUIDs. New users get `randomUUID()`. Seed users have fixed UUID literals, so their ids stay the same across restarts. Do not generate seed ids at runtime.
- `createdAt` and `updatedAt` are ISO 8601 strings. `update` always sets a new `updatedAt`, even when the input is empty.
- The repository returns copies, never stored objects, so callers cannot change the store by accident.
- `update` changes only the fields that were provided. A field set to `undefined` is skipped. The mapper also leaves omitted fields out entirely (`omitUndefined`), because a database might write `undefined` as NULL.

## Auth rules

- `POST /api/login` takes JSON `{ username, password }`. It returns 200 `{ username }` and sets the `userlist_session` cookie when the credentials match, 401 `{ error }` when they don't (wrong password, unknown username or empty strings), and 400 `{ error }` when either field is missing or not a string, or the body isn't a JSON object. Unparseable JSON also gets a JSON 400, from the router's error handler.
- `GET /api/session` returns 200 `{ username }` for a valid cookie, and 401 `{ error }` when the cookie is missing, tampered with, sealed with another secret or expired.
- The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/` and `Max-Age=300`. The session lasts 5 minutes from login and is never renewed: `/api/session` never calls `save()`.
- Iron accepts a seal for 60 seconds past its `ttl` to allow for clock skew, so `sessionOptions` sets the seal `ttl` to 300 − 60. The server then rejects the cookie at exactly 5 minutes, the same moment the browser drops it. Keep the two in step if the TTL changes.
- Call `session.save()` before sending the response, or the `Set-Cookie` header is lost.
- `/graphql` requires a valid session. `requireSession` runs after `cors()`, so CORS preflights are answered without one, and before `express.json()`, so a rejected request's body is never parsed.
  - Without a valid session it answers 401 with `{ errors: [{ message: 'Not logged in', extensions: { code: 'UNAUTHENTICATED' } }] }` (`UNAUTHENTICATED_BODY`), and no resolver runs. A cookie that is missing, tampered with, sealed with another secret or expired all count as no session.
  - It only reads the session and never calls `save()`, so GraphQL traffic doesn't renew it.
  - One exception: a `GET` that prefers `text/html` passes through, because that's the browser loading the Apollo Sandbox page. Apollo answers it with the static page and never runs a query, and a test checks that no data leaks. Queries sent from Sandbox need a session like any other. A browser that logged in through the UI has one, because cookies ignore the port.
  - `resolvers.test.ts` builds the context by hand, so it passes `username` itself.
- Usernames are matched exactly (case-sensitive). The session holds only the username.

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
- `src/server.test.ts`: starts a real server per test with `startServer({ port: 0, ... })` and sends requests with `fetch`. It covers HTTP status codes, routing, CORS, the context and the auth routes. Node's `fetch` does not keep cookies, so the auth tests read `headers.getSetCookie()` and send the cookie back by hand. `post()` sends GraphQL as the logged-in `admin`: it logs in on its first call in each test, because hashing makes logins slow. `postWithoutSession()` sends no cookie, and `loginCookie(server?)` returns a fresh cookie. To tamper with a cookie, replace its last characters (`slice(0, -4) + 'AAAA'`). Appending one character still verifies, because base64 decoding ignores a stray trailing character. The expiry tests use `vi.useFakeTimers({ toFake: ['Date'] })`. Fake only `Date`, because faking timers hangs `fetch`.
- `src/auth/password.test.ts` and `src/auth/inMemoryCredentialStore.test.ts`: test hashing and the store. The store is a single module-level object, so its tests and the auth tests in `server.test.ts` use the hardcoded logins (`admin` / `admin123`, `demo` / `demo123`). These plaintext passwords appear only in tests.
- New behavior is written test-first: add the tests, confirm they fail, then implement.

## Known limitations

- CORS allows any origin on `/graphql` (`cors()` with no options), without credentials. A cross-origin browser call can't send the session cookie, so it gets a 401. The `/api` routes have no CORS at all. The UI doesn't need it, because its Vite dev and preview servers proxy `/graphql` and `/api` to this server, so the browser stays same-origin. A deployment without that proxy would need CORS with a fixed `origin` and `credentials: true`.
- Resolvers don't check per-user permissions: any logged-in user can read and change every user. There is no logout route.
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
