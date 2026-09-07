# DeployFlow Specification

## Project purpose

DeployFlow is a self-hosted deployment platform for trusted, public GitHub repositories that contain a Dockerfile. It will build a repository into a Docker image, run the application in a Docker container, and provide deployment management and monitoring from a web interface.

This repository currently contains the backend foundation, PostgreSQL persistence schema, JWT-based authentication, authenticated project management, an internal GitHub repository preparation service, and an internal Docker image build service. Container execution and the frontend are future milestones.

## MVP requirements

The completed MVP should support:

- User registration and login.
- Deployment projects with a public GitHub repository URL, Git branch, and application container port.
- Cloning public repositories and verifying that a Dockerfile exists.
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
4. The backend verifies that the repository contains a Dockerfile.
5. Docker builds an image while build state and logs are streamed to the user.
6. DeployFlow selects an available host port and starts the application container.
7. The backend records the outcome and exposes state, logs, and basic runtime metrics.
8. The user can stop, restart, or redeploy the application; each deployment is retained in history.

## Supported repository assumptions

- Repositories are public GitHub repositories.
- Repositories are trusted test projects controlled or reviewed by the DeployFlow operator.
- A Dockerfile exists at the expected repository location.
- The Dockerfile produces a runnable application image.
- The user supplies the correct branch and internal application port.
- A single Docker host has enough resources to build and run the project.

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
