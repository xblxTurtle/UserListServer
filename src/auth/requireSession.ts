import type { RequestHandler } from 'express';
import type { SessionReader } from './session.ts';

/** Body of the 401, shaped like a GraphQL response so GraphQL clients can read the error code. */
export const UNAUTHENTICATED_BODY = {
  errors: [{ message: 'Not logged in', extensions: { code: 'UNAUTHENTICATED' } }],
};

/**
 * Guards the GraphQL endpoint. Without a valid session it answers 401 with `UNAUTHENTICATED_BODY` and
 * no resolver runs. With one it stores the username in `res.locals.username` for the GraphQL context.
 *
 * One exception: a GET that prefers HTML is the browser loading the Apollo Sandbox page. It passes
 * through, because Apollo answers it with the static page and never runs the query. Any query the
 * page then sends is checked like every other request.
 */
export function requireSession(getSession: SessionReader): RequestHandler {
  return async (req, res, next) => {
    if (req.method === 'GET' && req.accepts(['application/json', 'text/html']) === 'text/html') {
      next();
      return;
    }

    // Read only: never save() here, so the TTL stays fixed from login.
    const { username } = await getSession(req, res);
    if (username === undefined) {
      res.status(401).json(UNAUTHENTICATED_BODY);
      return;
    }
    res.locals.username = username;
    next();
  };
}
