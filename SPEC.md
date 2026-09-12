# DeployFlow Specification

## Project purpose

DeployFlow is a self-hosted deployment platform for trusted, public GitHub repositories. It builds a repository into a Docker image, runs the application in a Docker container, and provides deployment management and monitoring from a web interface. A root Dockerfile is preferred, while a conservative set of Dockerfile-free Node.js and Python web applications can use a temporary generated Dockerfile.

This repository currently contains the backend foundation, PostgreSQL persistence schema, JWT-based authentication, authenticated project management, an internal GitHub repository preparation service, and an internal Docker image build service. Container execution and the frontend are future milestones.

## MVP requirements

The completed MVP should support:

- User registration and login.
- Deployment projects with a public GitHub repository URL, Git branch, and application container port.
- Cloning public repositories and preparing an existing or safely generated Dockerfile.
- Building a Docker image and starting a container.
- Assigning an available host port.
- Displaying deployment state and build/runtime logs.
- Stopping, restarting, and redeploying applications.
- Deployment history.
- Basic CPU, memory, and uptime monitoring.

## Deployment workflow

1. An authenticated user creates a project and supplies a public GitHub repository URL, branch, and container port.
2. DeployFlow validates the input and creates a deployment record.
3. The backend clones the selected branch into an isolated working directory.
4. The backend uses a root Dockerfile when present. Otherwise it detects a supported npm-based Node.js application or a supported Flask, FastAPI, or Streamlit application and generates a Dockerfile only in the temporary clone.
5. Docker builds an image while build state and logs are streamed to the user. Dependency installation and repository-provided npm or Python build steps run only inside Docker.
6. DeployFlow selects an available host port and starts the application container.
7. The backend records the outcome and exposes state, logs, and basic runtime metrics.
8. The user can stop, restart, or redeploy the application; each deployment is retained in history.

## Supported repository assumptions

- Repositories are public GitHub repositories.
- Repositories are trusted test projects controlled or reviewed by the DeployFlow operator.
- A valid root Dockerfile exists, or the repository matches one of the supported automatic detection modes below.
- An existing or generated Dockerfile produces a runnable application image.
- The user supplies the correct branch and internal application port.
- A single Docker host has enough resources to build and run the project.

## Automatic application detection

Detection is ordered and conservative:

1. A regular root `Dockerfile` always uses the repository's existing Dockerfile unchanged.
2. A regular root `package.json` selects Node.js detection. The file must be valid JSON with a non-empty `scripts.start` string. npm is used; `package-lock.json` selects `npm ci`, otherwise `npm install` is used. A non-empty `scripts.build` adds `npm run build` to the image build.
3. A regular root `requirements.txt` or a standard PEP 621 `pyproject.toml` selects Python detection. A pip-installable `pyproject.toml` must contain `[project]` dependencies and `[build-system]` metadata.
4. All other repositories fail with `Unsupported application type`; DeployFlow does not guess a launch command.

Supported Python layouts are intentionally narrow:

- Flask: root `app.py`, a Flask dependency, and a root `app = Flask(...)` application. Gunicorn is used when declared; otherwise the Flask module runner is used.
- FastAPI: root `main.py`, FastAPI and Uvicorn dependencies, and a root `app = FastAPI(...)` application.
- Streamlit: root `app.py` and a Streamlit dependency.

Generated Node.js images use Node 22 on Debian slim, set `HOST=0.0.0.0` and `PORT` to the configured container port, and start with `npm start`. The application must honor those conventional environment variables. Generated Python images use Python 3.13 slim and install from `requirements.txt` or the repository's standard project metadata. Generated launch commands bind supported Python applications to `0.0.0.0` on the project's configured container port. Generated Dockerfiles exist only inside DeployFlow's temporary clone and are deleted with that directory after the build workflow.

## Security limitations

This portfolio MVP is not a secure multi-tenant sandbox. Building and running repository code can give that code access to compute, network, and other resources made available to Docker. Only trusted test repositories may be deployed. Production use would require stronger isolation, resource limits, network controls, image and dependency scanning, secret management, audit logging, rate limits, and host hardening.

Secrets must never be committed or hardcoded. Runtime configuration must be supplied through environment variables.

## Out of scope

- Kubernetes.
- Redis or Kafka.
- Microservices.
- Payments and billing.
- Teams or organizations.
- Custom domains.
- Autoscaling.
- Multi-server scheduling.
- Arbitrary untrusted public code execution.
- Private GitHub repositories.
- AI features.
