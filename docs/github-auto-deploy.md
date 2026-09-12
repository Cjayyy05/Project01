# GitHub webhook auto-deploy

DeployFlow can create a new deployment when GitHub reports a push to a project's configured branch. The webhook is repository-specific and requires no GitHub account token or broad account permissions.

## Server configuration

Set these backend environment variables before starting DeployFlow:

```env
GITHUB_WEBHOOK_SECRET_KEY=<at-least-32-random-characters>
PUBLIC_BASE_URL=https://deployflow.example.com
```

- `GITHUB_WEBHOOK_SECRET_KEY` is a private server-side master key. Use a different value from `JWT_SECRET`. DeployFlow derives a distinct webhook secret for every project and never stores that derived secret in the database.
- `PUBLIC_BASE_URL` is the public origin that reaches the DeployFlow backend. It must not include a path, query, or fragment.

Changing `GITHUB_WEBHOOK_SECRET_KEY` changes every project's derived webhook secret. Update the affected GitHub webhooks after rotating it.

Apply the database migration before using webhooks:

```powershell
cd backend
npm run prisma:migrate:deploy
```

The delivery table stores GitHub delivery IDs so redelivered requests do not create duplicate deployments.

## Configure the webhook in GitHub

1. Open the project in DeployFlow and find **GitHub auto-deploy → Webhook configuration**.
2. In the GitHub repository, open **Settings → Webhooks → Add webhook**.
3. Copy DeployFlow's **Payload URL** into GitHub. It has this form:

   ```text
   https://deployflow.example.com/api/webhooks/github/<project-id>
   ```

4. Set **Content type** to `application/json`.
5. Copy DeployFlow's **Webhook secret** into GitHub's **Secret** field.
6. Select **Just the push event**.
7. Leave the webhook active and save it.

Treat the displayed secret like a password. Do not commit it, place it in a repository, or share it with other users.

## How requests are accepted

For every request, DeployFlow:

1. Uses the project ID in the webhook URL to select the project-specific secret.
2. verifies GitHub's `X-Hub-Signature-256` HMAC-SHA256 signature against the exact raw request body;
3. accepts only the GitHub `push` event;
4. confirms `repository.full_name` matches the project's configured public GitHub repository;
5. confirms the pushed `refs/heads/<branch>` matches the project's configured branch; and
6. atomically records `X-GitHub-Delivery` before starting a new deployment.

Invalid or unsigned requests are rejected. Unrelated repositories, branches, and event types are acknowledged but ignored. A successful push starts a new deployment and preserves existing deployment history. The currently running deployment is left in place until the new deployment reaches `RUNNING`; a failed automatic deployment does not stop the previous one.

## Testing from localhost

GitHub cannot send webhooks directly to `localhost`. For local testing, create a secure HTTPS public tunnel to the backend's port (normally `4000`) and set `PUBLIC_BASE_URL` to that tunnel origin. Restart the backend, then copy the refreshed Payload URL from the project page into GitHub.

Only expose the webhook endpoint for testing, keep the tunnel URL private where practical, and stop the tunnel when finished. The webhook HMAC must remain enabled even when a tunnel is used.

After pushing to the configured branch, GitHub's webhook delivery page should show an HTTP `202` response. DeployFlow will add a new deployment to the project's history and stream its normal status and log events.
