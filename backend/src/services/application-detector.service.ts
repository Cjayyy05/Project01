import { lstat, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { AppError } from '../utils/app-error.js';

const MAX_CONFIGURATION_FILE_BYTES = 1024 * 1024;
const MAX_ENTRYPOINT_FILE_BYTES = 2 * 1024 * 1024;
const NODE_RUNTIME_IMAGE = 'node:22-bookworm-slim';
const PYTHON_RUNTIME_IMAGE = 'python:3.13-slim';

export type DetectedApplicationType = 'DOCKERFILE' | 'NODE' | 'PYTHON';

export type ApplicationDetectionInput = {
  repositoryDirectory: string;
  containerPort: number;
};

export type ApplicationDetectionResult = {
  applicationType: DetectedApplicationType;
  generatedDockerfile: boolean;
  framework: 'dockerfile' | 'node' | 'flask' | 'fastapi' | 'streamlit';
};

type FileDetails = {
  exists: boolean;
  path: string;
};

type BuildStrategy = {
  prepare: (
    repositoryDirectory: string,
    containerPort: number,
  ) => Promise<ApplicationDetectionResult>;
};

const isMissingFileError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'ENOENT';

const inspectRootFile = async (
  repositoryDirectory: string,
  filename: string,
): Promise<FileDetails> => {
  const path = join(repositoryDirectory, filename);

  try {
    const details = await lstat(path);
    if (!details.isFile() || details.isSymbolicLink()) {
      throw new AppError(422, `${filename} must be a regular file`);
    }
    return { exists: true, path };
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    if (isMissingFileError(error)) return { exists: false, path };
    throw new AppError(500, `Unable to inspect ${filename}`);
  }
};

const readTextFile = async (path: string, maximumBytes: number): Promise<string> => {
  try {
    const details = await lstat(path);
    if (details.size > maximumBytes) {
      throw new AppError(422, 'Application configuration file is too large');
    }
    return await readFile(path, 'utf8');
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    throw new AppError(422, 'Unable to read application configuration');
  }
};

const validateContainerPort = (containerPort: number): number => {
  if (
    !Number.isInteger(containerPort) ||
    containerPort < 1 ||
    containerPort > 65_535
  ) {
    throw new AppError(400, 'Container port must be between 1 and 65535');
  }
  return containerPort;
};

const writeGeneratedDockerfile = async (
  repositoryDirectory: string,
  contents: string,
): Promise<void> => {
  try {
    await writeFile(join(repositoryDirectory, 'Dockerfile'), contents, {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch {
    throw new AppError(500, 'Unable to create generated Dockerfile');
  }
};

const renderDockerCommand = (args: readonly string[]): string =>
  `CMD ${JSON.stringify(args)}`;

const normalizePackageName = (requirement: string): string | null => {
  const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(requirement.trim());
  return match?.[1]?.toLowerCase().replace(/[._]+/g, '-') ?? null;
};

const parseRequirements = (contents: string): Set<string> => {
  const packages = new Set<string>();

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#') || line.startsWith('-')) {
      continue;
    }
    const packageName = normalizePackageName(line);
    if (packageName !== null) packages.add(packageName);
  }

  return packages;
};

const getTomlSection = (contents: string, name: string): string | null => {
  const lines = contents.split(/\r?\n/);
  const header = `[${name}]`;
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) return null;

  const section: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[[^\]]+\]\s*(?:#.*)?$/.test(line)) break;
    section.push(line);
  }
  return section.join('\n');
};

const parsePyprojectDependencies = (contents: string): Set<string> => {
  const projectSection = getTomlSection(contents, 'project');
  const buildSection = getTomlSection(contents, 'build-system');

  if (
    projectSection === null ||
    buildSection === null ||
    !/^\s*build-backend\s*=\s*["'][^"'\r\n]+["']/m.test(buildSection)
  ) {
    throw new AppError(
      422,
      'Python pyproject.toml must use standard project and build-system metadata',
    );
  }

  const dependencyList =
    /^\s*dependencies\s*=\s*\[([\s\S]*?)\]/m.exec(
      projectSection,
    )?.[1];
  if (dependencyList === undefined) {
    throw new AppError(
      422,
      'Python pyproject.toml must declare project dependencies',
    );
  }

  const packages = new Set<string>();
  const quotedRequirement = /(["'])([^"'\r\n]+)\1/g;
  for (const match of dependencyList.matchAll(quotedRequirement)) {
    const packageName = normalizePackageName(match[2] ?? '');
    if (packageName !== null) packages.add(packageName);
  }

  if (packages.size === 0 && dependencyList.trim().length > 0) {
    throw new AppError(422, 'Python project dependencies could not be parsed');
  }
  return packages;
};

class DockerfileBuildStrategy implements BuildStrategy {
  public prepare(): Promise<ApplicationDetectionResult> {
    return Promise.resolve({
      applicationType: 'DOCKERFILE',
      generatedDockerfile: false,
      framework: 'dockerfile',
    });
  }
}

class NodeBuildStrategy implements BuildStrategy {
  public async prepare(
    repositoryDirectory: string,
    containerPort: number,
  ): Promise<ApplicationDetectionResult> {
    const packageJsonPath = join(repositoryDirectory, 'package.json');
    const contents = await readTextFile(
      packageJsonPath,
      MAX_CONFIGURATION_FILE_BYTES,
    );
    let packageJson: unknown;

    try {
      packageJson = JSON.parse(contents) as unknown;
    } catch {
      throw new AppError(422, 'package.json is malformed');
    }

    if (
      typeof packageJson !== 'object' ||
      packageJson === null ||
      Array.isArray(packageJson)
    ) {
      throw new AppError(422, 'package.json must contain a JSON object');
    }

    const scripts = (packageJson as Record<string, unknown>).scripts;
    const startScript =
      typeof scripts === 'object' && scripts !== null && !Array.isArray(scripts)
        ? (scripts as Record<string, unknown>).start
        : undefined;
    const buildScript =
      typeof scripts === 'object' && scripts !== null && !Array.isArray(scripts)
        ? (scripts as Record<string, unknown>).build
        : undefined;

    if (typeof startScript !== 'string' || startScript.trim().length === 0) {
      throw new AppError(
        422,
        'Node.js application must define a usable scripts.start command',
      );
    }
    if (buildScript !== undefined && typeof buildScript !== 'string') {
      throw new AppError(422, 'Node.js scripts.build must be a command string');
    }

    const lockfile = await inspectRootFile(
      repositoryDirectory,
      'package-lock.json',
    );
    const installCommand = lockfile.exists ? 'RUN npm ci' : 'RUN npm install';
    const manifestCopy = lockfile.exists
      ? 'COPY package.json package-lock.json ./'
      : 'COPY package.json ./';
    const buildCommand =
      typeof buildScript === 'string' && buildScript.trim().length > 0
        ? 'RUN npm run build'
        : '';
    const port = validateContainerPort(containerPort);

    await writeGeneratedDockerfile(
      repositoryDirectory,
      [
        `FROM ${NODE_RUNTIME_IMAGE}`,
        'WORKDIR /app',
        manifestCopy,
        installCommand,
        'COPY . .',
        buildCommand,
        'ENV NODE_ENV=production',
        'ENV HOST=0.0.0.0',
        `ENV PORT=${String(port)}`,
        `EXPOSE ${String(port)}`,
        renderDockerCommand(['npm', 'start']),
        '',
      ]
        .filter((line) => line.length > 0)
        .join('\n'),
    );

    return {
      applicationType: 'NODE',
      generatedDockerfile: true,
      framework: 'node',
    };
  }
}

class PythonBuildStrategy implements BuildStrategy {
  public async prepare(
    repositoryDirectory: string,
    containerPort: number,
  ): Promise<ApplicationDetectionResult> {
    const requirements = await inspectRootFile(
      repositoryDirectory,
      'requirements.txt',
    );
    const pyproject = await inspectRootFile(
      repositoryDirectory,
      'pyproject.toml',
    );
    const dependencyFile = requirements.exists ? requirements : pyproject;
    const contents = await readTextFile(
      dependencyFile.path,
      MAX_CONFIGURATION_FILE_BYTES,
    );
    const packages = requirements.exists
      ? parseRequirements(contents)
      : parsePyprojectDependencies(contents);
    const appFile = await inspectRootFile(repositoryDirectory, 'app.py');
    const mainFile = await inspectRootFile(repositoryDirectory, 'main.py');
    const appContents = appFile.exists
      ? await readTextFile(appFile.path, MAX_ENTRYPOINT_FILE_BYTES)
      : '';
    const mainContents = mainFile.exists
      ? await readTextFile(mainFile.path, MAX_ENTRYPOINT_FILE_BYTES)
      : '';

    const frameworks = [
      packages.has('flask') ? 'flask' : null,
      packages.has('fastapi') ? 'fastapi' : null,
      packages.has('streamlit') ? 'streamlit' : null,
    ].filter((value): value is 'flask' | 'fastapi' | 'streamlit' => value !== null);

    if (frameworks.length > 1) {
      throw new AppError(422, 'Python application framework is ambiguous');
    }

    const framework = frameworks[0];
    const port = validateContainerPort(containerPort);
    let command: readonly string[];

    if (
      framework === 'flask' &&
      appFile.exists &&
      /^app[\t ]*=[\t ]*Flask[\t ]*\(/m.test(appContents)
    ) {
      command = packages.has('gunicorn')
        ? ['gunicorn', '--bind', `0.0.0.0:${String(port)}`, 'app:app']
        : [
            'python',
            '-m',
            'flask',
            '--app',
            'app:app',
            'run',
            '--host',
            '0.0.0.0',
            '--port',
            String(port),
          ];
    } else if (
      framework === 'fastapi' &&
      packages.has('uvicorn') &&
      mainFile.exists &&
      /^app[\t ]*=[\t ]*FastAPI[\t ]*\(/m.test(mainContents)
    ) {
      command = [
        'uvicorn',
        'main:app',
        '--host',
        '0.0.0.0',
        '--port',
        String(port),
      ];
    } else if (framework === 'streamlit' && appFile.exists) {
      command = [
        'streamlit',
        'run',
        'app.py',
        '--server.address=0.0.0.0',
        `--server.port=${String(port)}`,
        '--server.headless=true',
      ];
    } else {
      throw new AppError(422, 'Unsupported Python application configuration');
    }

    const installSteps = requirements.exists
      ? ['COPY requirements.txt ./', 'RUN pip install --no-cache-dir -r requirements.txt', 'COPY . .']
      : ['COPY . .', 'RUN pip install --no-cache-dir .'];

    await writeGeneratedDockerfile(
      repositoryDirectory,
      [
        `FROM ${PYTHON_RUNTIME_IMAGE}`,
        'WORKDIR /app',
        ...installSteps,
        `EXPOSE ${String(port)}`,
        renderDockerCommand(command),
        '',
      ].join('\n'),
    );

    return {
      applicationType: 'PYTHON',
      generatedDockerfile: true,
      framework,
    };
  }
}

export class ApplicationDetector {
  readonly #dockerfileStrategy: BuildStrategy;
  readonly #nodeStrategy: BuildStrategy;
  readonly #pythonStrategy: BuildStrategy;

  public constructor() {
    this.#dockerfileStrategy = new DockerfileBuildStrategy();
    this.#nodeStrategy = new NodeBuildStrategy();
    this.#pythonStrategy = new PythonBuildStrategy();
  }

  public async prepareBuild(
    input: ApplicationDetectionInput,
  ): Promise<ApplicationDetectionResult> {
    const dockerfile = await inspectRootFile(
      input.repositoryDirectory,
      'Dockerfile',
    );
    if (dockerfile.exists) {
      return this.#dockerfileStrategy.prepare(
        input.repositoryDirectory,
        input.containerPort,
      );
    }

    const packageJson = await inspectRootFile(
      input.repositoryDirectory,
      'package.json',
    );
    if (packageJson.exists) {
      return this.#nodeStrategy.prepare(
        input.repositoryDirectory,
        input.containerPort,
      );
    }

    const requirements = await inspectRootFile(
      input.repositoryDirectory,
      'requirements.txt',
    );
    const pyproject = await inspectRootFile(
      input.repositoryDirectory,
      'pyproject.toml',
    );
    if (requirements.exists || pyproject.exists) {
      return this.#pythonStrategy.prepare(
        input.repositoryDirectory,
        input.containerPort,
      );
    }

    throw new AppError(422, 'Unsupported application type');
  }
}

export const applicationDetector = new ApplicationDetector();
