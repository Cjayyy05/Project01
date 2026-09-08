import type { Deployment, DeploymentStatus, Project } from "@/lib/api";

export type ProjectWithLatestDeployment = Project & {
  latestDeployment: Deployment | null;
};

const STATUS_LABELS: Record<DeploymentStatus, string> = {
  QUEUED: "Queued",
  CLONING: "Cloning",
  BUILDING: "Building",
  STARTING: "Starting",
  RUNNING: "Running",
  FAILED: "Failed",
  STOPPED: "Stopped",
};

const STATUS_STYLES: Record<DeploymentStatus, string> = {
  QUEUED: "border-slate-200 bg-slate-100 text-slate-700",
  CLONING: "border-blue-200 bg-blue-50 text-blue-700",
  BUILDING: "border-amber-200 bg-amber-50 text-amber-800",
  STARTING: "border-violet-200 bg-violet-50 text-violet-700",
  RUNNING: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FAILED: "border-red-200 bg-red-50 text-red-700",
  STOPPED: "border-slate-300 bg-white text-slate-600",
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : dateFormatter.format(date);
};

const repositoryName = (repositoryUrl: string): string =>
  repositoryUrl.replace(/^https:\/\/github\.com\//, "");

export function ProjectCard({ project }: { project: ProjectWithLatestDeployment }) {
  const latest = project.latestDeployment;

  return (
    <article className="flex min-h-64 flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight text-slate-950">
            {project.name}
          </h2>
          <a
            className="mt-1.5 block truncate text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
            href={project.repositoryUrl}
            rel="noreferrer"
            target="_blank"
          >
            {repositoryName(project.repositoryUrl)}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
        {latest === null ? (
          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            Not deployed
          </span>
        ) : (
          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[latest.status]}`}
          >
            {STATUS_LABELS[latest.status]}
          </span>
        )}
      </div>

      <dl className="mt-7 grid grid-cols-2 gap-4 border-y border-slate-100 py-5">
        <div>
          <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Branch
          </dt>
          <dd className="mt-1.5 truncate font-mono text-sm text-slate-800">
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

      <div className="mt-auto pt-5">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
          Latest deployment
        </p>
        {latest === null ? (
          <p className="mt-1.5 text-sm text-slate-500">No deployments yet</p>
        ) : (
          <time
            className="mt-1.5 block text-sm font-medium text-slate-700"
            dateTime={latest.createdAt}
          >
            {formatDate(latest.createdAt)}
          </time>
        )}
      </div>
    </article>
  );
}
