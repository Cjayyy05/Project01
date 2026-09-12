# DeployFlow backend

## Requirements

- Node.js 20 or newer.
- npm.
- PostgreSQL.

## Run locally

From the repository root:

```bash
cd backend
npm install
copy .env.example .env
```

On macOS or Linux, replace `copy .env.example .env` with `cp .env.example .env`.
Update `DATABASE_URL` in `.env` with the credentials for your local PostgreSQL database, then apply the committed migrations and start the API:

```bash
npm run prisma:migrate:deploy
npm run dev
```

Replace `JWT_SECRET` with a cryptographically random secret of at least 32 characters. `JWT_EXPIRES_IN` controls access-token lifetime and defaults to `1h`.

Generate independent JWT and GitHub webhook secrets in PowerShell with:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Run the command separately for each secret. Placeholder or obviously weak values are rejected outside the test environment, and secret values are never printed by DeployFlow.

Registration and network binding are controlled with:

```env
REGISTRATION_ENABLED=false
BIND_HOST=127.0.0.1
```

Registration is disabled by default. To create the first local account, temporarily set `REGISTRATION_ENABLED=true`, restart the backend, register the account, then restore it to `false` and restart again. Existing users can continue to log in while registration is disabled. The backend and deployed application ports are loopback-only by default.

DeployFlow currently assumes deployment repositories are trusted. It is not designed to safely execute arbitrary untrusted public code. Docker provides isolation, but is not treated as a hardened arbitrary-code sandbox.

`containerPort` is the port the deployed application listens on inside its future Docker container. It must be supplied by the user and is not inferred by DeployFlow.

The API listens on `http://localhost:4000` by default. Verify it with:

```bash
curl http://localhost:4000/api/health
```

Expected response:

```json
{"status":"ok"}
```

## Authentication endpoints

- `POST /api/auth/register` accepts `email` and `password`.
- `POST /api/auth/login` accepts `email` and `password` and returns a JWT.
- `GET /api/auth/me` requires `Authorization: Bearer <token>`.

Passwords must contain 8 to 128 characters, including at least one letter and one number.

## Project endpoints

All project endpoints require `Authorization: Bearer <token>`:

- `POST /api/projects` creates a project from `name`, `repositoryUrl`, optional `branch`, and `containerPort`.
- `GET /api/projects` lists the authenticated user's projects.
- `GET /api/projects/:id` returns an owned project.
- `DELETE /api/projects/:id` deletes an owned project.

The branch defaults to `main`. Repository URLs must use the form `https://github.com/<owner>/<repository>`, and `containerPort` must be an integer from 1 through 65535 representing the application's internal container port. Repository cloning is not implemented yet.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
```

After editing `prisma/schema.prisma`, run `npm run prisma:generate`. Create a development migration with `npm run prisma:migrate:dev -- --name <migration-name>`.

Create a production build with `npm run build`, then run it with `npm start`.
