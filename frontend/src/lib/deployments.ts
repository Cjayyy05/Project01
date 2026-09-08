import type { DeploymentStatus } from "@/lib/api";

export const DEPLOYMENT_STATUS_LABELS: Record<DeploymentStatus, string> = {
  QUEUED: "Queued",
  CLONING: "Cloning",
  BUILDING: "Building",
  STARTING: "Starting",
  RUNNING: "Running",
  FAILED: "Failed",
  STOPPED: "Stopped",
};

export const DEPLOYMENT_STATUS_STYLES: Record<DeploymentStatus, string> = {
  QUEUED: "border-slate-200 bg-slate-100 text-slate-700",
  CLONING: "border-blue-200 bg-blue-50 text-blue-700",
  BUILDING: "border-amber-200 bg-amber-50 text-amber-800",
  STARTING: "border-violet-200 bg-violet-50 text-violet-700",
  RUNNING: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FAILED: "border-red-200 bg-red-50 text-red-700",
  STOPPED: "border-slate-300 bg-white text-slate-600",
};

export const isDeploymentInProgress = (status: DeploymentStatus): boolean =>
  status === "QUEUED" ||
  status === "CLONING" ||
  status === "BUILDING" ||
  status === "STARTING";

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export const formatDateTime = (value: string | null): string => {
  if (value === null) return "—";

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown time"
    : dateTimeFormatter.format(date);
};
