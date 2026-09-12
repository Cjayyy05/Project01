"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ApiError,
  projectApi,
  type GitHubWebhookConfiguration,
} from "@/lib/api";

type GitHubWebhookPanelProps = {
  onUnauthorized: () => void;
  projectId: string;
  token: string;
};

export function GitHubWebhookPanel({
  onUnauthorized,
  projectId,
  token,
}: GitHubWebhookPanelProps) {
  const [configuration, setConfiguration] =
    useState<GitHubWebhookConfiguration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [secretVisible, setSecretVisible] = useState(false);
  const [copiedField, setCopiedField] = useState<"secret" | "url" | null>(null);

  const loadConfiguration = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await projectApi.getWebhookConfiguration(
          token,
          projectId,
          signal,
        );
        setConfiguration(result);
      } catch (requestError: unknown) {
        if (signal?.aborted === true) return;
        if (requestError instanceof ApiError && requestError.status === 401) {
          onUnauthorized();
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load GitHub webhook settings.",
        );
      } finally {
        if (signal?.aborted !== true) setIsLoading(false);
      }
    },
    [onUnauthorized, projectId, token],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadConfiguration(controller.signal);
    });
    return () => controller.abort();
  }, [loadConfiguration]);

  const copyValue = async (field: "secret" | "url", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2_000);
    } catch {
      setError("Unable to copy automatically. Select the value and copy it manually.");
    }
  };

  const localWebhookUrl =
    configuration?.url.startsWith("http://localhost:") === true ||
    configuration?.url.startsWith("http://127.0.0.1:") === true;

  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-blue-700 uppercase">
            GitHub auto-deploy
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
            Webhook configuration
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Add these values to this repository&apos;s GitHub webhook settings. Only
            pushes to the configured branch will deploy.
          </p>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          Push events
        </span>
      </div>

      {isLoading ? (
        <div className="mt-6 grid animate-pulse gap-4 md:grid-cols-2" role="status">
          <span className="sr-only">Loading webhook configuration</span>
          <div className="h-20 rounded-xl bg-slate-100" />
          <div className="h-20 rounded-xl bg-slate-100" />
        </div>
      ) : null}

      {!isLoading && error !== null && configuration === null ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
          <p>{error}</p>
          <button
            className="mt-3 font-semibold text-red-900 underline underline-offset-2"
            onClick={() => void loadConfiguration()}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      {configuration !== null ? (
        <div className="mt-6 space-y-4">
          {error !== null ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {error}
            </p>
          ) : null}

          <label className="block text-sm font-medium text-slate-800">
            Payload URL
            <div className="mt-2 flex gap-2">
              <input
                className="form-input mt-0 font-mono text-xs"
                readOnly
                value={configuration.url}
              />
              <button
                className="button-secondary shrink-0"
                onClick={() => void copyValue("url", configuration.url)}
                type="button"
              >
                {copiedField === "url" ? "Copied" : "Copy"}
              </button>
            </div>
          </label>

          <label className="block text-sm font-medium text-slate-800">
            Webhook secret
            <div className="mt-2 flex flex-wrap gap-2 sm:flex-nowrap">
              <input
                className="form-input mt-0 min-w-0 font-mono text-xs"
                readOnly
                type={secretVisible ? "text" : "password"}
                value={configuration.secret}
              />
              <button
                className="button-secondary shrink-0"
                onClick={() => setSecretVisible((visible) => !visible)}
                type="button"
              >
                {secretVisible ? "Hide" : "Show"}
              </button>
              <button
                className="button-secondary shrink-0"
                onClick={() => void copyValue("secret", configuration.secret)}
                type="button"
              >
                {copiedField === "secret" ? "Copied" : "Copy"}
              </button>
            </div>
          </label>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Content type
              </dt>
              <dd className="mt-1 font-mono text-sm text-slate-800">
                {configuration.contentType}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                GitHub event
              </dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">
                Just the push event
              </dd>
            </div>
          </dl>

          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            Keep the webhook secret private. Anyone who has it can trigger builds
            for this project.
          </p>

          {localWebhookUrl ? (
            <p className="text-sm leading-6 text-slate-600">
              This URL points to localhost. GitHub requires a secure public tunnel
              to reach your local DeployFlow backend during testing.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
