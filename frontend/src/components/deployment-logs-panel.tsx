"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import type { Deployment, DeploymentStatus } from "@/lib/api";
import {
  DEPLOYMENT_STATUS_LABELS,
  DEPLOYMENT_STATUS_STYLES,
} from "@/lib/deployments";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";
const MAX_LOG_ENTRIES = 1_000;
const BOTTOM_THRESHOLD_PX = 32;

type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

type LogEntry = {
  id: number;
  receivedAt: Date;
  source: "deployment" | "build" | "error";
  message: string;
};

type SubscriptionResult =
  | { ok: true; room: string }
  | { ok: false; error: string };

type ClientToServerEvents = {
  "deployment:subscribe": (
    payload: { deploymentId: string },
    acknowledge: (result: SubscriptionResult) => void,
  ) => void;
};

type ServerToClientEvents = {
  "deployment:status": (payload: {
    deploymentId: string;
    status: string;
  }) => void;
  "deployment:log": (payload: {
    deploymentId: string;
    source: "deployment" | "build";
    message: string;
  }) => void;
  "deployment:complete": (payload: { deployment: Deployment }) => void;
  "deployment:error": (payload: {
    deployment: Deployment;
    errorMessage: string;
  }) => void;
};

const CONNECTION_LABELS: Record<ConnectionState, string> = {
  connecting: "Connecting",
  connected: "Live",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
  error: "Connection error",
};

const CONNECTION_STYLES: Record<ConnectionState, string> = {
  connecting: "bg-amber-400",
  connected: "bg-emerald-400",
  reconnecting: "bg-amber-400",
  disconnected: "bg-slate-500",
  error: "bg-red-400",
};

const DEPLOYMENT_STATUSES = new Set<string>([
  "QUEUED",
  "CLONING",
  "BUILDING",
  "STARTING",
  "RUNNING",
  "FAILED",
  "STOPPED",
]);

const isDeploymentStatus = (value: string): value is DeploymentStatus =>
  DEPLOYMENT_STATUSES.has(value);

const logTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const formatLogTime = (date: Date): string => logTimeFormatter.format(date);

const shortDeploymentId = (deploymentId: string): string =>
  deploymentId.slice(0, 8);

export function DeploymentLogsPanel({
  deployments,
  selectedDeploymentId,
  token,
  onSelectDeployment,
}: {
  deployments: Deployment[];
  selectedDeploymentId: string | null;
  token: string;
  onSelectDeployment: (deploymentId: string) => void;
}) {
  const selectedDeployment =
    deployments.find((deployment) => deployment.id === selectedDeploymentId) ??
    null;
  const [currentStatus, setCurrentStatus] = useState<DeploymentStatus | null>(
    selectedDeployment?.status ?? null,
  );
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    selectedDeployment === null ? "disconnected" : "connecting",
  );
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(
    selectedDeployment?.status === "FAILED"
      ? selectedDeployment.errorMessage
      : null,
  );
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const nextLogId = useRef(0);
  const outputRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setCurrentStatus(selectedDeployment?.status ?? null);
      setFailureMessage(
        selectedDeployment?.status === "FAILED"
          ? selectedDeployment.errorMessage
        : null,
      );
    });

    return () => {
      cancelled = true;
    };
  }, [selectedDeployment?.errorMessage, selectedDeployment?.status]);

  useEffect(() => {
    if (selectedDeployment === null) return;

    const deploymentId = selectedDeployment.id;
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
      SOCKET_URL,
      {
        auth: { token },
        autoConnect: false,
        transports: ["websocket"],
        reconnection: true,
      },
    );

    const addLog = (
      source: LogEntry["source"],
      message: string,
    ): void => {
      const entry: LogEntry = {
        id: nextLogId.current,
        receivedAt: new Date(),
        source,
        message,
      };
      nextLogId.current += 1;
      setLogs((current) => [...current, entry].slice(-MAX_LOG_ENTRIES));
    };

    const subscribe = (): void => {
      setConnectionState("connecting");
      setConnectionMessage(null);
      socket.emit(
        "deployment:subscribe",
        { deploymentId },
        (result) => {
          if (result.ok) {
            setConnectionState("connected");
            return;
          }

          setConnectionState("error");
          setConnectionMessage(result.error);
        },
      );
    };

    socket.on("connect", subscribe);
    socket.on("connect_error", (error) => {
      setConnectionState(socket.active ? "reconnecting" : "error");
      setConnectionMessage(error.message);
    });
    socket.on("disconnect", () => {
      setConnectionState(socket.active ? "reconnecting" : "disconnected");
    });
    socket.io.on("reconnect_attempt", () => {
      setConnectionState("reconnecting");
      setConnectionMessage(null);
    });
    socket.io.on("reconnect_failed", () => {
      setConnectionState("error");
      setConnectionMessage("Unable to reconnect to deployment events");
    });

    socket.on("deployment:status", (payload) => {
      if (
        payload.deploymentId === deploymentId &&
        isDeploymentStatus(payload.status)
      ) {
        setCurrentStatus(payload.status);
      }
    });
    socket.on("deployment:log", (payload) => {
      if (payload.deploymentId === deploymentId) {
        addLog(payload.source, payload.message);
      }
    });
    socket.on("deployment:complete", ({ deployment }) => {
      if (deployment.id === deploymentId) {
        setCurrentStatus(deployment.status);
        setFailureMessage(null);
      }
    });
    socket.on("deployment:error", ({ deployment, errorMessage }) => {
      if (deployment.id === deploymentId) {
        setCurrentStatus("FAILED");
        setFailureMessage(errorMessage);
        addLog("error", errorMessage);
      }
    });

    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
    };
  }, [selectedDeployment, token]);

  useEffect(() => {
    const output = outputRef.current;
    if (output !== null && shouldAutoScroll.current) {
      output.scrollTop = output.scrollHeight;
    }
  }, [logs]);

  const handleOutputScroll = () => {
    const output = outputRef.current;
    if (output === null) return;

    const distanceFromBottom =
      output.scrollHeight - output.scrollTop - output.clientHeight;
    shouldAutoScroll.current = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
  };

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-white">Deployment logs</h2>
            <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-300">
              <span
                className={`h-2 w-2 rounded-full ${CONNECTION_STYLES[connectionState]}`}
                aria-hidden="true"
              />
              {CONNECTION_LABELS[connectionState]}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Live events for one selected deployment. Historical events are not replayed.
          </p>
        </div>

        <label className="text-xs font-medium text-slate-300">
          Selected deployment
          <select
            className="mt-1 block min-h-9 max-w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-100 focus:border-blue-400 focus:outline-none"
            disabled={deployments.length === 0}
            onChange={(event) => onSelectDeployment(event.target.value)}
            value={selectedDeploymentId ?? ""}
          >
            {deployments.length === 0 ? (
              <option value="">No deployments</option>
            ) : null}
            {deployments.map((deployment) => (
              <option key={deployment.id} value={deployment.id}>
                {shortDeploymentId(deployment.id)} · {DEPLOYMENT_STATUS_LABELS[deployment.status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-900/70 px-5 py-3">
        <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">
          Current status
        </span>
        {currentStatus === null ? (
          <span className="text-xs font-semibold text-slate-400">Not deployed</span>
        ) : (
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${DEPLOYMENT_STATUS_STYLES[currentStatus]}`}
          >
            {DEPLOYMENT_STATUS_LABELS[currentStatus]}
          </span>
        )}
      </div>

      {connectionMessage !== null ? (
        <p className="border-b border-red-900/70 bg-red-950/60 px-5 py-3 text-xs text-red-200" role="alert">
          {connectionMessage}
        </p>
      ) : null}

      {failureMessage !== null ? (
        <div className="border-b border-red-900/70 bg-red-950/60 px-5 py-3" role="alert">
          <p className="text-xs font-semibold tracking-wide text-red-300 uppercase">
            Deployment failed
          </p>
          <p className="mt-1 text-sm text-red-100">{failureMessage}</p>
        </div>
      ) : null}

      <div
        aria-label="Live deployment log output"
        aria-live="polite"
        className="h-80 overflow-y-auto overscroll-contain px-5 py-4 font-mono text-xs leading-5 text-slate-200"
        onScroll={handleOutputScroll}
        ref={outputRef}
        role="log"
        tabIndex={0}
      >
        {selectedDeployment === null ? (
          <p className="text-slate-500">Deploy the project to begin receiving events.</p>
        ) : logs.length === 0 ? (
          <p className="text-slate-500">Waiting for live deployment events…</p>
        ) : (
          <ol className="space-y-1.5">
            {logs.map((entry) => (
              <li className="grid grid-cols-[auto_auto_1fr] gap-3" key={entry.id}>
                <time
                  className="text-slate-500"
                  dateTime={entry.receivedAt.toISOString()}
                  title={`Received ${entry.receivedAt.toLocaleString()}`}
                >
                  {formatLogTime(entry.receivedAt)}
                </time>
                <span
                  className={
                    entry.source === "error"
                      ? "text-red-400"
                      : entry.source === "build"
                        ? "text-amber-300"
                        : "text-blue-300"
                  }
                >
                  [{entry.source}]
                </span>
                <span className="min-w-0 whitespace-pre-wrap break-words">
                  {entry.message}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
