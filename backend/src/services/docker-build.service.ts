import { lstat, readFile, realpath } from 'node:fs/promises';
import { relative, sep } from 'node:path';
import dockerIgnore from '@balena/dockerignore';
import { type Ignore } from '@balena/dockerignore';
import Dockerode from 'dockerode';
import tar from 'tar-fs';

import { AppError } from '../utils/app-error.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_ID_PATTERN = /^sha256:[0-9a-f]{64}$/i;
const DOCKERFILE_NAME = 'Dockerfile';
const MAX_IMAGE_IDENTIFIER_LENGTH = 512;

export type DockerBuildInput = {
  repositoryDirectory: string;
  projectId: string;
  deploymentId: string;
};

export type DockerBuildOutput = {
  stream?: string;
  status?: string;
  progress?: string;
  error?: string;
};

export type DockerBuildOutputCallback = (output: DockerBuildOutput) => void;

export type DockerBuildResult = {
  imageId: string;
  imageTag: string;
};

type DockerImage = {
  inspect: () => Promise<{ Id: string }>;
  remove: (options: { force: boolean }) => Promise<unknown>;
};

const isDockerNotFoundError = (error: unknown): boolean =>
  isRecord(error) && error.statusCode === 404;

type DockerBuildOptions = {
  dockerfile: string;
  t: string;
  rm: boolean;
  forcerm: boolean;
};

type DockerBuildStream = NodeJS.ReadableStream & {
  destroy: () => void;
};

type DockerClient = {
  buildImage: (
    context: NodeJS.ReadableStream,
    options: DockerBuildOptions,
  ) => Promise<DockerBuildStream>;
  getImage: (name: string) => DockerImage;
  modem: {
    followProgress: (
      stream: NodeJS.ReadableStream,
      onFinished: (error: Error | null, result: unknown[]) => void,
      onProgress?: (output: unknown) => void,
    ) => void;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getString = (
  value: Record<string, unknown>,
  key: string,
): string | undefined =>
  typeof value[key] === 'string' ? value[key] : undefined;

const normalizeBuildOutput = (value: unknown): DockerBuildOutput => {
  if (!isRecord(value)) {
    return {};
  }

  const errorDetail = isRecord(value.errorDetail)
    ? getString(value.errorDetail, 'message')
    : undefined;

  const output: DockerBuildOutput = {};
  const stream = getString(value, 'stream');
  const status = getString(value, 'status');
  const progress = getString(value, 'progress');
  const error = getString(value, 'error') ?? errorDetail;

  if (stream !== undefined) output.stream = stream;
  if (status !== undefined) output.status = status;
  if (progress !== undefined) output.progress = progress;
  if (error !== undefined) output.error = error;

  return output;
};

const parseIdentifier = (value: string, label: string): string => {
  if (!UUID_PATTERN.test(value)) {
    throw new AppError(400, `${label} must be a valid UUID`);
  }

  return value.toLowerCase();
};

const isMissingFileError = (error: unknown): boolean =>
  isRecord(error) && error.code === 'ENOENT';

const normalizeContextPath = (root: string, path: string): string =>
  relative(root, path).split(sep).join('/');

const createBuildContext = async (
  repositoryDirectory: string,
): Promise<DockerBuildStream> => {
  let dockerIgnoreContents = '';

  try {
    dockerIgnoreContents = await readFile(
      `${repositoryDirectory}/.dockerignore`,
      'utf8',
    );
  } catch (error: unknown) {
    if (!isMissingFileError(error)) {
      throw new AppError(500, 'Unable to read Docker build context rules');
    }
  }

  let matcher: Ignore;

  try {
    const createDockerIgnore = dockerIgnore as unknown as () => Ignore;
    matcher = createDockerIgnore().add(dockerIgnoreContents);
  } catch {
    throw new AppError(422, 'Repository contains an invalid .dockerignore');
  }

  return tar.pack(repositoryDirectory, {
    dereference: false,
    strict: true,
    ignore: (path) => {
      const contextPath = normalizeContextPath(repositoryDirectory, path);

      if (
        contextPath === '' ||
        contextPath === DOCKERFILE_NAME ||
        contextPath === '.dockerignore'
      ) {
        return false;
      }

      return (
        contextPath === '.git' ||
        contextPath.startsWith('.git/') ||
        matcher.ignores(contextPath)
      );
    },
  }) as unknown as DockerBuildStream;
};

const validateRepositoryDirectory = async (
  repositoryDirectory: string,
): Promise<string> => {
  if (repositoryDirectory.trim().length === 0) {
    throw new AppError(400, 'Repository directory is required');
  }

  let directoryDetails;

  try {
    directoryDetails = await lstat(repositoryDirectory);
  } catch {
    throw new AppError(400, 'Repository directory does not exist');
  }

  if (!directoryDetails.isDirectory() || directoryDetails.isSymbolicLink()) {
    throw new AppError(400, 'Repository directory must be a real directory');
  }

  const resolvedDirectory = await realpath(repositoryDirectory);

  try {
    const dockerfileDetails = await lstat(
      `${resolvedDirectory}/${DOCKERFILE_NAME}`,
    );

    if (!dockerfileDetails.isFile() || dockerfileDetails.isSymbolicLink()) {
      throw new AppError(422, 'Dockerfile not found at repository root');
    }
  } catch (error: unknown) {
    if (error instanceof AppError) {
      throw error;
    }

    if (isMissingFileError(error)) {
      throw new AppError(422, 'Dockerfile not found at repository root');
    }

    throw new AppError(500, 'Unable to inspect repository Dockerfile');
  }

  return resolvedDirectory;
};

export class DockerBuildService {
  readonly #docker: DockerClient;

  public constructor(
    docker: DockerClient = new Dockerode() as unknown as DockerClient,
  ) {
    this.#docker = docker;
  }

  public async buildImage(
    input: DockerBuildInput,
    onOutput?: DockerBuildOutputCallback,
  ): Promise<DockerBuildResult> {
    const projectId = parseIdentifier(input.projectId, 'Project ID');
    const deploymentId = parseIdentifier(input.deploymentId, 'Deployment ID');
    const repositoryDirectory = await validateRepositoryDirectory(
      input.repositoryDirectory,
    );
    const imageTag = `deployflow/project-${projectId}/deployment-${deploymentId}`;
    const context = await createBuildContext(repositoryDirectory);
    let buildStream: DockerBuildStream | undefined;

    try {
      const activeBuildStream = await this.#docker.buildImage(context, {
        dockerfile: DOCKERFILE_NAME,
        t: imageTag,
        rm: true,
        forcerm: true,
      });
      buildStream = activeBuildStream;

      let buildFailure = false;

      await new Promise<void>((resolve, reject) => {
        this.#docker.modem.followProgress(
          activeBuildStream,
          (error, result) => {
            if (
              error !== null ||
              buildFailure ||
              result.some((output) => normalizeBuildOutput(output).error !== undefined)
            ) {
              reject(new AppError(422, 'Docker image build failed'));
              return;
            }

            resolve();
          },
          (rawOutput) => {
            const output = normalizeBuildOutput(rawOutput);
            buildFailure ||= output.error !== undefined;

            try {
              onOutput?.(output);
            } catch {
              reject(new AppError(500, 'Docker build output handler failed'));
            }
          },
        );
      });

      const image = await this.#docker.getImage(imageTag).inspect();

      if (!IMAGE_ID_PATTERN.test(image.Id)) {
        throw new AppError(500, 'Docker returned an invalid image ID');
      }

      return { imageId: image.Id.toLowerCase(), imageTag };
    } catch (error: unknown) {
      await this.#removePartialImage(imageTag);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(422, 'Docker image build failed');
    } finally {
      context.destroy();
      buildStream?.destroy();
    }
  }

  public async removeImage(imageIdentifier: string): Promise<void> {
    const normalizedIdentifier = imageIdentifier.trim();

    if (
      normalizedIdentifier.length === 0 ||
      normalizedIdentifier.length > MAX_IMAGE_IDENTIFIER_LENGTH ||
      /\s/.test(normalizedIdentifier)
    ) {
      throw new AppError(400, 'Image identifier is invalid');
    }

    try {
      await this.#docker
        .getImage(normalizedIdentifier)
        .remove({ force: true });
    } catch {
      throw new AppError(422, 'Unable to remove Docker image');
    }
  }

  public async imageExists(imageIdentifier: string): Promise<boolean> {
    const normalizedIdentifier = imageIdentifier.trim();

    if (
      normalizedIdentifier.length === 0 ||
      normalizedIdentifier.length > MAX_IMAGE_IDENTIFIER_LENGTH ||
      /\s/.test(normalizedIdentifier)
    ) {
      throw new AppError(400, 'Image identifier is invalid');
    }

    try {
      await this.#docker.getImage(normalizedIdentifier).inspect();
      return true;
    } catch (error: unknown) {
      if (isDockerNotFoundError(error)) return false;
      throw new AppError(503, 'Unable to inspect Docker image');
    }
  }

  async #removePartialImage(imageTag: string): Promise<void> {
    try {
      await this.#docker.getImage(imageTag).remove({ force: true });
    } catch {
      // A failed build may not have created an image to remove.
    }
  }
}

export const dockerBuildService = new DockerBuildService();
