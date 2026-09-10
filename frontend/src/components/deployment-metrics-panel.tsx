"use client";

import { useEffect, useState } from "react";

import {
  ApiError,
  deploymentApi,
  type Deployment,
  type DeploymentMetrics,
} from "@/lib/api";
import {
  DEPLOYMENT_STATUS_LABELS,
  DEPLOYMENT_STATUS_STYLES,
} from "@/lib/deployments";

const METRICS_POLL_INTERVAL_MS = 5_000;

type DeploymentMetricsPanelProps = {
  deployment: Deployment | null;
  onUnauthorized: () => void;
  token: string;
};

const formatPercent = (value: number): string =>
  `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;

const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const scaledValue = value / 1024 ** unitIndex;
  const precision = unitIndex === 0 || scaledValue >= 10 ? 0 : 1;

  return `${scaledValue.toFixed(precision)} ${units[unitIndex]}`;
};

const formatUptime = (rawSeconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(rawSeconds));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const getPausedMessage = (deployment: Deployment | null): string => {
  if (deployment === null) return "Select a deployment to view its runtime metrics.";
  if (deployment.status === "STOPPED") {
    return "Monitoring is paused because this deployment is stopped.";
  }
  if (deployment.status === "FAILED") {
    return "Runtime metrics are unavailable because this deployment failed.";
  }
  if (deployment.status !== "RUNNING") {
    return "Monitoring will begin when this deployment is running.";
  }
  return "Runtime metrics are unavailable because this deployment has no container.";
};

export function DeploymentMetricsPanel({
  deployment,
  onUnauthorized,
  token,
}: DeploymentMetricsPanelProps) {
  const shouldPoll =
    deployment?.status === "RUNNING" && deployment.containerId !== null;
  const [metrics, setMetrics] = useState<DeploymentMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(shouldPoll);
  const [availability, setAvailability] = useState<
    "available" | "missing" | "temporary"
  >("available");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!shouldPoll || deployment === null) return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let requestController: AbortController | undefined;
    let keepPolling = true;

    const poll = async () => {
      const pollStartedAt = Date.now();
      requestController = new AbortController();

      try {
        const nextMetrics = await deploymentApi.getMetrics(
          token,
          deployment.id,
          requestController.signal,
        );
        if (disposed) return;

        setMetrics(nextMetrics);
        setAvailability("available");
        setLastUpdatedAt(new Date());
        keepPolling = nextMetrics.status === "RUNNING";
      } catch (error: unknown) {
        if (disposed || requestController.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          keepPolling = false;
          onUnauthorized();
          return;
        }

        const containerIsMissing =
          error instanceof ApiError &&
          (error.status === 404 || error.status === 409);
        setAvailability(containerIsMissing ? "missing" : "temporary");
        if (containerIsMissing) keepPolling = false;
      } finally {
        if (!disposed && keepPolling) {
          setIsLoading(false);
          timer = setTimeout(
            poll,
            Math.max(
              0,
              METRICS_POLL_INTERVAL_MS - (Date.now() - pollStartedAt),
            ),
          );
        } else if (!disposed) {
          setIsLoading(false);
        }
      }
    };

    void poll();

    return () => {
      disposed = true;
      requestController?.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [deployment, onUnauthorized, shouldPoll, token]);

  const displayedStatus = metrics?.status ?? deployment?.status;

  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">
            Runtime monitoring
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Current container values refresh every five seconds while running.
          </p>
        </div>
        {lastUpdatedAt !== null ? (
          <p className="text-xs text-slate-500">
            Updated {lastUpdatedAt.toLocaleTimeString()}
          </p>
        ) : null}
      </div>

      {!shouldPoll ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
          {getPausedMessage(deployment)}
        </div>
      ) : (
        <>
          {availability !== "available" ? (
            <div
              className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              role="status"
            >
              {availability === "missing"
                ? "Runtime metrics are unavailable because the container could not be found."
                : "Metrics are temporarily unavailable. DeployFlow will retry automatically."}
            </div>
          ) : null}

          {isLoading && metrics === null ? (
            <div className="mt-6 grid animate-pulse gap-3 sm:grid-cols-2 xl:grid-cols-4" role="status">
              <span className="sr-only">Loading runtime metrics</span>
              {Array.from({ length: 4 }, (_, index) => (
                <div className="h-24 rounded-xl bg-slate-100" key={index} />
              ))}
            </div>
          ) : (
            <dl className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Container status
                </dt>
                <dd className="mt-3">
                  {displayedStatus !== undefined ? (
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${DEPLOYMENT_STATUS_STYLES[displayedStatus]}`}
                    >
                      {DEPLOYMENT_STATUS_LABELS[displayedStatus]}
                    </span>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  CPU usage
                </dt>
                <dd className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  {metrics === null ? "—" : formatPercent(metrics.cpu.usagePercent)}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Memory usage
                </dt>
                <dd className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  {metrics === null
                    ? "—"
                    : formatPercent(metrics.memory.usagePercent)}
                </dd>
                {metrics !== null ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {formatBytes(metrics.memory.usageBytes)} of{" "}
                    {formatBytes(metrics.memory.limitBytes)}
                  </p>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Uptime
                </dt>
                <dd className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  {metrics === null ? "—" : formatUptime(metrics.uptime.uptimeSeconds)}
                </dd>
              </div>
            </dl>
          )}
        </>
      )}
    </section>
  );
}
