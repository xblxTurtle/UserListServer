import express, {
  type NextFunction,
  type Request,
  type Response,
  type Router,
} from 'express';
import { getIronSession, nodeCookies } from 'iron-session';
import type { CredentialStore } from './CredentialStore.ts';
import { sessionOptions, type SessionConfig, type SessionData } from './session.ts';

/**
 * REST auth routes, mounted under `API_PATH` (`/api`) in server.ts, so the full paths are
 * `/api/login` and `/api/session`:
 * - `POST /login` with JSON `{ username, password }`: 200 `{ username }` and a
 *   session cookie, 401 for wrong credentials, 400 for a malformed body.
 * - `GET /session`: 200 `{ username }`, or 401 without a valid session.
 *
 * Throws at creation if the session secret is too short, so a bad config
 * stops startup instead of failing every request.
 */
export function createAuthRouter(credentials: CredentialStore, session: SessionConfig): Router {
  const options = sessionOptions(session);
  const getSession = (req: Request, res: Response) =>
    getIronSession<SessionData>(nodeCookies(req, res), options);

  const router = express.Router();

  // JSON parsing on this route only, so the router doesn't parse other paths' bodies.
  router.post('/login', express.json(), async (req, res) => {
    // req.body is undefined when there is no JSON body.
    const { username, password } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'username and password must be strings' });
      return;
    }

    if (!(await credentials.verify(username, password))) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const current = await getSession(req, res);
    current.username = username;
    // Must run before the response is sent, or the Set-Cookie header is lost.
    await current.save();
    res.json({ username });
  });

  router.get('/session', async (req, res) => {
    // Read only: never save() here, so the 5-minute TTL stays fixed from login.
    const { username } = await getSession(req, res);
    if (username === undefined) {
      res.status(401).json({ error: 'Not logged in' });
      return;
    }
    res.json({ username });
  });

  // express.json() rejects unparseable JSON with a 400 error. Answer it as JSON
  // like the other auth errors, instead of Express's HTML page with a stack trace.
  router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof SyntaxError && (error as { type?: unknown }).type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Request body must be valid JSON' });
      return;
    }
    next(error);
  });

  return router;
}
