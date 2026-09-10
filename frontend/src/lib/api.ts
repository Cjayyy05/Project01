const API_BASE_PATH = "/backend-api";

export type AuthUser = {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  userId: string;
  name: string;
  repositoryUrl: string;
  branch: string;
  containerPort: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateProjectInput = {
  name: string;
  repositoryUrl: string;
  branch: string;
  containerPort: number;
};

export type DeploymentStatus =
  | "QUEUED"
  | "CLONING"
  | "BUILDING"
  | "STARTING"
  | "RUNNING"
  | "FAILED"
  | "STOPPED";

export type Deployment = {
  id: string;
  projectId: string;
  commitHash: string | null;
  status: DeploymentStatus;
  containerId: string | null;
  imageId: string | null;
  imageTag: string | null;
  hostPort: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeploymentMetrics = {
  status: DeploymentStatus;
  cpu: {
    usagePercent: number;
    totalUsage: number;
    systemUsage: number;
    onlineCpus: number;
  };
  memory: {
    usageBytes: number;
    limitBytes: number;
    usagePercent: number;
  };
  uptime: {
    startedAt: string | null;
    uptimeSeconds: number;
  };
};

type UserResponse = { user: AuthUser };
type LoginResponse = UserResponse & { token: string };
type ProjectResponse = { project: Project };
type ProjectsResponse = { projects: Project[] };
type DeploymentResponse = { deployment: Deployment };
type DeploymentsResponse = { deployments: Deployment[] };
type DeploymentMetricsResponse = { metrics: DeploymentMetrics };
type ErrorResponse = { error?: { message?: unknown } };

export class ApiError extends Error {
  public readonly status: number;

  public constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = RequestInit & { token?: string };

const request = async <T>(
  path: string,
  { token, headers: inputHeaders, ...options }: RequestOptions = {},
): Promise<T> => {
  const headers = new Headers(inputHeaders);

  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token !== undefined) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;

  try {
    response = await fetch(`${API_BASE_PATH}${path}`, {
      ...options,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      0,
      "Unable to reach DeployFlow. Check that the backend is running and try again.",
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | ErrorResponse
    | T
    | null;

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error?.message === "string"
        ? payload.error.message
        : "The request could not be completed.";
    throw new ApiError(response.status, message);
  }

  if (payload === null) {
    throw new ApiError(500, "The server returned an invalid response.");
  }

  return payload as T;
};

export const authApi = {
  async login(email: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  async register(email: string, password: string): Promise<AuthUser> {
    const response = await request<UserResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return response.user;
  },

  async me(token: string, signal?: AbortSignal): Promise<AuthUser> {
    const response = await request<UserResponse>("/auth/me", {
      token,
      signal,
    });
    return response.user;
  },
};

export const projectApi = {
  async list(token: string, signal?: AbortSignal): Promise<Project[]> {
    const response = await request<ProjectsResponse>("/projects", {
      token,
      signal,
    });
    return response.projects;
  },

  async create(token: string, input: CreateProjectInput): Promise<Project> {
    const response = await request<ProjectResponse>("/projects", {
      method: "POST",
      token,
      body: JSON.stringify(input),
    });
    return response.project;
  },

  async get(
    token: string,
    projectId: string,
    signal?: AbortSignal,
  ): Promise<Project> {
    const response = await request<ProjectResponse>(
      `/projects/${encodeURIComponent(projectId)}`,
      { token, signal },
    );
    return response.project;
  },

  async listDeployments(
    token: string,
    projectId: string,
    signal?: AbortSignal,
  ): Promise<Deployment[]> {
    const response = await request<DeploymentsResponse>(
      `/projects/${encodeURIComponent(projectId)}/deployments`,
      { token, signal },
    );
    return response.deployments;
  },
};

const deploymentAction = async (
  token: string,
  path: string,
): Promise<Deployment> => {
  const response = await request<DeploymentResponse>(path, {
    method: "POST",
    token,
  });
  return response.deployment;
};

export const deploymentApi = {
  async deploy(token: string, projectId: string): Promise<Deployment> {
    return deploymentAction(
      token,
      `/projects/${encodeURIComponent(projectId)}/deploy`,
    );
  },

  async stop(token: string, deploymentId: string): Promise<Deployment> {
    return deploymentAction(
      token,
      `/deployments/${encodeURIComponent(deploymentId)}/stop`,
    );
  },

  async restart(token: string, deploymentId: string): Promise<Deployment> {
    return deploymentAction(
      token,
      `/deployments/${encodeURIComponent(deploymentId)}/restart`,
    );
  },

  async redeploy(token: string, deploymentId: string): Promise<Deployment> {
    return deploymentAction(
      token,
      `/deployments/${encodeURIComponent(deploymentId)}/redeploy`,
    );
  },

  async getMetrics(
    token: string,
    deploymentId: string,
    signal?: AbortSignal,
  ): Promise<DeploymentMetrics> {
    const response = await request<DeploymentMetricsResponse>(
      `/deployments/${encodeURIComponent(deploymentId)}/metrics`,
      { token, signal },
    );
    return response.metrics;
  },
};
