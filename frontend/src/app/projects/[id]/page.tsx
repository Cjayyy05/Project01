"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/context/auth-context";
import {
  ApiError,
  deploymentApi,
  projectApi,
  type Deployment,
  type Project,
} from "@/lib/api";
import {
  DEPLOYMENT_STATUS_LABELS,
  DEPLOYMENT_STATUS_STYLES,
  formatDateTime,
  isDeploymentInProgress,
} from "@/lib/deployments";

type DeploymentAction = "deploy" | "stop" | "restart" | "redeploy";

const ACTION_LABELS: Record<DeploymentAction, string> = {
  deploy: "Deploy",
  stop: "Stop",
  restart: "Restart",
  redeploy: "Redeploy",
};

const ACTION_PENDING_LABELS: Record<DeploymentAction, string> = {
  deploy: "Deploying…",
  stop: "Stopping…",
  restart: "Restarting…",
  redeploy: "Redeploying…",
};

function StatusBadge({ status }: { status: Deployment["status"] }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${DEPLOYMENT_STATUS_STYLES[status]}`}
    >
      {DEPLOYMENT_STATUS_LABELS[status]}
    </span>
  );
}

function ProjectDetailsSkeleton() {
  return (
    <div className="animate-pulse" role="status" aria-label="Loading project details">
      <div className="h-5 w-32 rounded bg-slate-200" />
      <div className="mt-7 h-10 w-72 max-w-full rounded bg-slate-200" />
      <div className="mt-4 h-5 w-full max-w-xl rounded bg-slate-200" />
      <div className="mt-9 grid gap-5 lg:grid-cols-3">
        <div className="h-72 rounded-2xl border border-slate-200 bg-white lg:col-span-2" />
        <div className="h-72 rounded-2xl border border-slate-200 bg-white" />
      </div>
      <div className="mt-5 h-80 rounded-2xl border border-slate-200 bg-white" />
    </div>
  );
}

export default function ProjectDetailsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { logout, token } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<DeploymentAction | null>(null);

  const loadProject = useCallback(
    async (signal?: AbortSignal, showLoading = true) => {
      if (token === null) return;

      if (showLoading) setIsLoading(true);
      setLoadError(null);

      try {
        const [projectResult, deploymentResult] = await Promise.all([
          projectApi.get(token, projectId, signal),
          projectApi.listDeployments(token, projectId, signal),
        ]);
        setProject(projectResult);
        setDeployments(deploymentResult);
      } catch (requestError: unknown) {
        if (signal?.aborted === true) return;

        if (requestError instanceof ApiError && requestError.status === 401) {
          logout();
          return;
        }

        setLoadError(
          requestError instanceof ApiError && requestError.status === 404
            ? "This project does not exist or you do not have access to it."
            : requestError instanceof Error
              ? requestError.message
              : "Unable to load this project.",
        );
      } finally {
        if (showLoading && signal?.aborted !== true) setIsLoading(false);
      }
    },
    [logout, projectId, token],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadProject(controller.signal);
    });
    return () => controller.abort();
  }, [loadProject]);

  const latestDeployment = deployments[0] ?? null;
  const deploymentBusy =
    latestDeployment !== null && isDeploymentInProgress(latestDeployment.status);
  const actionsBusy = pendingAction !== null || deploymentBusy;
  const hasUsableContainer =
    latestDeployment?.containerId != null &&
    (latestDeployment.status === "RUNNING" || latestDeployment.status === "STOPPED");

  const actionAvailability = useMemo(
    () => ({
      deploy: latestDeployment === null && !actionsBusy,
      stop:
        latestDeployment?.status === "RUNNING" &&
        latestDeployment.containerId !== null &&
        !actionsBusy,
      restart: hasUsableContainer && !actionsBusy,
      redeploy: latestDeployment !== null && !actionsBusy,
    }),
    [actionsBusy, hasUsableContainer, latestDeployment],
  );

  const runAction = async (action: DeploymentAction) => {
    if (token === null || !actionAvailability[action]) return;

    setPendingAction(action);
    setActionError(null);

    try {
      if (action === "deploy") {
        await deploymentApi.deploy(token, projectId);
      } else if (latestDeployment !== null) {
        if (action === "stop") {
          await deploymentApi.stop(token, latestDeployment.id);
        } else if (action === "restart") {
          await deploymentApi.restart(token, latestDeployment.id);
        } else {
          await deploymentApi.redeploy(token, latestDeployment.id);
        }
      }

      await loadProject(undefined, false);
    } catch (requestError: unknown) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        logout();
        return;
      }

      setActionError(
        requestError instanceof Error
          ? requestError.message
          : `${ACTION_LABELS[action]} could not be completed.`,
      );
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="flex-1 bg-slate-50 px-6 py-10 lg:px-8 lg:py-12">
      <div className="mx-auto w-full max-w-7xl">
        {isLoading ? <ProjectDetailsSkeleton /> : null}

        {!isLoading && loadError !== null ? (
          <div className="rounded-2xl border border-red-200 bg-white px-6 py-12 text-center shadow-sm">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-lg font-semibold text-red-700">
              !
            </div>
            <h1 className="mt-4 text-xl font-semibold text-slate-950">
              Project could not be loaded
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
              {loadError}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link className="button-secondary" href="/dashboard">
                Back to projects
              </Link>
              <button
                className="button-primary"
                onClick={() => void loadProject()}
                type="button"
              >
                Try again
              </button>
            </div>
          </div>
        ) : null}

        {!isLoading && loadError === null && project !== null ? (
          <>
            <Link
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"
              href="/dashboard"
            >
              <span aria-hidden="true">←</span> Back to projects
            </Link>

            <div className="mt-6 flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-blue-700">Project details</p>
                <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  {project.name}
                </h1>
                <a
                  className="mt-3 block break-all text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
                  href={project.repositoryUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {project.repositoryUrl}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>

              <div className="flex flex-wrap gap-3" aria-label="Deployment actions">
                {(
                  ["deploy", "stop", "restart", "redeploy"] as const
                ).map((action) => (
                  <button
                    className={action === "deploy" || action === "redeploy" ? "button-primary" : "button-secondary"}
                    disabled={!actionAvailability[action]}
                    key={action}
                    onClick={() => void runAction(action)}
                    type="button"
                  >
                    {pendingAction === action
                      ? ACTION_PENDING_LABELS[action]
                      : ACTION_LABELS[action]}
                  </button>
                ))}
              </div>
            </div>

            {deploymentBusy ? (
              <div
                className="mt-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"
                role="status"
              >
                Deployment is {DEPLOYMENT_STATUS_LABELS[latestDeployment.status].toLowerCase()}.
                Actions will be available when it finishes.
              </div>
            ) : null}

            {actionError !== null ? (
              <div
                className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                role="alert"
              >
                {actionError}
              </div>
            ) : null}

            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                  Latest deployment
                </h2>

                {latestDeployment === null ? (
                  <div className="mt-6 rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center">
                    <p className="font-medium text-slate-800">No deployments yet</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Use Deploy to build and start this project for the first time.
                    </p>
                  </div>
                ) : (
                  <div className="mt-6">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
                      <StatusBadge status={latestDeployment.status} />
                      {latestDeployment.status === "RUNNING" &&
                      latestDeployment.hostPort !== null ? (
                        <div className="text-right">
                          <a
                            className="button-primary"
                            href={`http://localhost:${latestDeployment.hostPort}`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Open Application
                          </a>
                          <p className="mt-2 text-xs text-slate-500">
                            Local deployment access
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                          Commit hash
                        </dt>
                        <dd className="mt-1.5 break-all font-mono text-sm text-slate-800">
                          {latestDeployment.commitHash ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                          Host port
                        </dt>
                        <dd className="mt-1.5 font-mono text-sm text-slate-800">
                          {latestDeployment.status === "RUNNING" && latestDeployment.hostPort !== null
                            ? latestDeployment.hostPort
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                          Created
                        </dt>
                        <dd className="mt-1.5 text-sm text-slate-800">
                          {formatDateTime(latestDeployment.createdAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                          Started
                        </dt>
                        <dd className="mt-1.5 text-sm text-slate-800">
                          {formatDateTime(latestDeployment.startedAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                          Finished
                        </dt>
                        <dd className="mt-1.5 text-sm text-slate-800">
                          {formatDateTime(latestDeployment.finishedAt)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                  Configuration
                </h2>
                <dl className="mt-6 space-y-5">
                  <div>
                    <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                      Project name
                    </dt>
                    <dd className="mt-1.5 break-words text-sm font-medium text-slate-800">
                      {project.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                      Repository
                    </dt>
                    <dd className="mt-1.5 break-all text-sm text-slate-800">
                      {project.repositoryUrl}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                      Branch
                    </dt>
                    <dd className="mt-1.5 break-all font-mono text-sm text-slate-800">
                      {project.branch}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                      Container port
                    </dt>
                    <dd className="mt-1.5 font-mono text-sm text-slate-800">
                      {project.containerPort}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>

            <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-5">
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                  Deployment history
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Previous deployments remain available as a permanent project record.
                </p>
              </div>

              {deployments.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-slate-500">
                  No deployment history yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-5xl border-collapse text-left text-sm">
                    <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                      <tr>
                        <th className="px-6 py-3 font-semibold" scope="col">Deployment ID</th>
                        <th className="px-4 py-3 font-semibold" scope="col">Status</th>
                        <th className="px-4 py-3 font-semibold" scope="col">Commit hash</th>
                        <th className="px-4 py-3 font-semibold" scope="col">Created</th>
                        <th className="px-4 py-3 font-semibold" scope="col">Started</th>
                        <th className="px-6 py-3 font-semibold" scope="col">Finished</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {deployments.map((deployment) => (
                        <tr className="text-slate-700" key={deployment.id}>
                          <td className="px-6 py-4 font-mono text-xs text-slate-800">
                            {deployment.id}
                          </td>
                          <td className="px-4 py-4">
                            <StatusBadge status={deployment.status} />
                          </td>
                          <td className="max-w-52 truncate px-4 py-4 font-mono text-xs" title={deployment.commitHash ?? undefined}>
                            {deployment.commitHash ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            {formatDateTime(deployment.createdAt)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            {formatDateTime(deployment.startedAt)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            {formatDateTime(deployment.finishedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
