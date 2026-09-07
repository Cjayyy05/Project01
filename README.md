# DeployFlow

DeployFlow is a portfolio project for a self-hosted deployment platform. The intended MVP accepts trusted public GitHub repositories containing Dockerfiles, builds and runs them with Docker, and provides deployment lifecycle controls, logs, history, and basic monitoring.

## Repository layout

- `frontend/` — reserved for the future Next.js application.
- `backend/` — Express and TypeScript API.
- `docs/` — supporting project documentation.
- `.github/` — GitHub configuration and workflows.
- `SPEC.md` — product scope, assumptions, workflow, and limitations.
- `AGENTS.md` — permanent development instructions.

## Current implementation

The current milestone provides the backend foundation and `GET /api/health`. It intentionally does not include the frontend, database, Prisma, authentication, Git operations, or Docker functionality.

See [`backend/README.md`](backend/README.md) for local setup and commands.

