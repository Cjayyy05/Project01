"use client";

import { useState, type FormEvent } from "react";

import { projectApi } from "@/lib/api";

type CreateProjectFormProps = {
  token: string;
  onCancel: () => void;
  onCreated: () => Promise<void>;
};

const isValidGitHubRepository = (value: string): boolean => {
  try {
    const url = new URL(value);
    const segments = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);

    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      segments.length === 2
    );
  } catch {
    return false;
  }
};

export function CreateProjectForm({
  token,
  onCancel,
  onCreated,
}: CreateProjectFormProps) {
  const [name, setName] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [containerPort, setContainerPort] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedRepositoryUrl = repositoryUrl.trim();
    const normalizedBranch = branch.trim();
    const parsedPort = Number(containerPort);

    if (normalizedName.length === 0 || normalizedName.length > 100) {
      setError("Project name must be between 1 and 100 characters.");
      return;
    }
    if (!isValidGitHubRepository(normalizedRepositoryUrl)) {
      setError("Enter a public GitHub repository URL, such as https://github.com/owner/repository.");
      return;
    }
    if (normalizedBranch.length === 0 || normalizedBranch.length > 255) {
      setError("Branch must be between 1 and 255 characters.");
      return;
    }
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
      setError("Container port must be an integer from 1 to 65535.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await projectApi.create(token, {
        name: normalizedName,
        repositoryUrl: normalizedRepositoryUrl,
        branch: normalizedBranch,
        containerPort: parsedPort,
      });
      await onCreated();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create the project. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      aria-labelledby="create-project-title"
      className="mb-8 rounded-2xl border border-blue-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm font-semibold text-blue-700">New project</p>
          <h2
            className="mt-1 text-xl font-semibold tracking-tight text-slate-950"
            id="create-project-title"
          >
            Connect a GitHub repository
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Add the repository and runtime settings DeployFlow will use later.
          </p>
        </div>
        <button
          className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>

      <form className="mt-7" noValidate onSubmit={handleSubmit}>
        {error !== null ? (
          <div
            className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-800">
            Project name
            <input
              autoComplete="off"
              className="form-input"
              disabled={isSubmitting}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              placeholder="Customer API"
              required
              value={name}
            />
          </label>

          <label className="block text-sm font-medium text-slate-800">
            Public GitHub repository URL
            <input
              autoCapitalize="none"
              autoComplete="url"
              className="form-input"
              disabled={isSubmitting}
              inputMode="url"
              maxLength={2048}
              onChange={(event) => setRepositoryUrl(event.target.value)}
              placeholder="https://github.com/owner/repository"
              required
              type="url"
              value={repositoryUrl}
            />
          </label>

          <label className="block text-sm font-medium text-slate-800">
            Branch
            <input
              autoCapitalize="none"
              autoComplete="off"
              className="form-input font-mono"
              disabled={isSubmitting}
              maxLength={255}
              onChange={(event) => setBranch(event.target.value)}
              placeholder="main"
              required
              value={branch}
            />
          </label>

          <label className="block text-sm font-medium text-slate-800">
            Container port
            <input
              aria-describedby="container-port-help"
              className="form-input font-mono"
              disabled={isSubmitting}
              inputMode="numeric"
              max={65_535}
              min={1}
              onChange={(event) => setContainerPort(event.target.value)}
              placeholder="3000"
              required
              step={1}
              type="number"
              value={containerPort}
            />
            <span
              className="mt-2 block text-xs leading-5 text-slate-500"
              id="container-port-help"
            >
              Container port is the port your application listens on inside Docker,
              such as 3000, 5000, or 8080.
            </span>
          </label>
        </div>

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="button-secondary"
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button className="button-primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Creating project…" : "Create project"}
          </button>
        </div>
      </form>
    </section>
  );
}
