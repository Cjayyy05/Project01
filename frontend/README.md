# DeployFlow frontend

Next.js App Router frontend for DeployFlow, built with strict TypeScript and Tailwind CSS.

## Local setup

1. Copy `.env.example` to `.env.local` if the backend is not running at `http://localhost:4000`.
2. Start the backend.
3. Run `npm run dev` and open `http://localhost:3000`.

Browser requests to `/backend-api/*` are proxied to the Express API using `BACKEND_API_URL`, avoiding a cross-origin dependency in local development.
The live deployment event connection uses `NEXT_PUBLIC_SOCKET_URL` from the browser and defaults to `http://localhost:4000`.

## Commands

- `npm run dev` — start the development server
- `npm run lint` — run ESLint
- `npm run typecheck` — run strict TypeScript checks
- `npm run build` — create a production build
