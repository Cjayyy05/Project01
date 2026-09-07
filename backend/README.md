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
