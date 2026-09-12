import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ApplicationDetector } from '../src/services/application-detector.service.js';

describe('ApplicationDetector', () => {
  let repositoryDirectory: string;
  let detector: ApplicationDetector;

  beforeEach(async () => {
    repositoryDirectory = await mkdtemp(join(tmpdir(), 'deployflow-detect-'));
    detector = new ApplicationDetector();
  });

  afterEach(async () => {
    await rm(repositoryDirectory, { recursive: true, force: true });
  });

  const write = (filename: string, contents: string) =>
    writeFile(join(repositoryDirectory, filename), contents, 'utf8');

  const generatedDockerfile = () =>
    readFile(join(repositoryDirectory, 'Dockerfile'), 'utf8');

  it('preserves and prioritizes an existing root Dockerfile', async () => {
    const originalDockerfile = 'FROM scratch\n';
    await write('Dockerfile', originalDockerfile);
    await write('package.json', '{ malformed');

    const result = await detector.prepareBuild({
      repositoryDirectory,
      containerPort: 8080,
    });

    expect(result).toEqual({
      applicationType: 'DOCKERFILE',
      generatedDockerfile: false,
      framework: 'dockerfile',
    });
    expect(await generatedDockerfile()).toBe(originalDockerfile);
  });

  it('generates an npm Node.js image for a start script', async () => {
    await write(
      'package.json',
      JSON.stringify({ scripts: { start: 'node server.js' } }),
    );

    const result = await detector.prepareBuild({
      repositoryDirectory,
      containerPort: 3000,
    });
    const dockerfile = await generatedDockerfile();

    expect(result.applicationType).toBe('NODE');
    expect(dockerfile).toContain('FROM node:22-bookworm-slim');
    expect(dockerfile).toContain('RUN npm install');
    expect(dockerfile).not.toContain('RUN npm run build');
    expect(dockerfile).toContain('ENV HOST=0.0.0.0');
    expect(dockerfile).toContain('ENV PORT=3000');
    expect(dockerfile).toContain('EXPOSE 3000');
    expect(dockerfile).toContain('CMD ["npm","start"]');
  });

  it('uses npm ci and runs the declared build lifecycle when a lockfile exists', async () => {
    await write(
      'package.json',
      JSON.stringify({
        scripts: { start: 'node dist/server.js', build: 'tsc' },
      }),
    );
    await write('package-lock.json', '{}');

    await detector.prepareBuild({ repositoryDirectory, containerPort: 8080 });
    const dockerfile = await generatedDockerfile();

    expect(dockerfile).toContain('COPY package.json package-lock.json ./');
    expect(dockerfile).toContain('RUN npm ci');
    expect(dockerfile).toContain('RUN npm run build');
  });

  it('rejects malformed package.json instead of falling through to Python', async () => {
    await write('package.json', '{ not valid JSON');
    await write('requirements.txt', 'flask\n');
    await write('app.py', 'app = Flask(__name__)\n');

    await expect(
      detector.prepareBuild({ repositoryDirectory, containerPort: 8080 }),
    ).rejects.toMatchObject({
      statusCode: 422,
      message: 'package.json is malformed',
    });
  });

  it('rejects a Node.js project without a usable start script', async () => {
    await write(
      'package.json',
      JSON.stringify({ scripts: { build: 'vite build' } }),
    );

    await expect(
      detector.prepareBuild({ repositoryDirectory, containerPort: 8080 }),
    ).rejects.toMatchObject({
      statusCode: 422,
      message: 'Node.js application must define a usable scripts.start command',
    });
  });

  it('detects a root Flask app and uses Gunicorn when declared', async () => {
    await write('requirements.txt', 'Flask==3.1.0\ngunicorn>=23\n');
    await write(
      'app.py',
      'from flask import Flask\napp = Flask(__name__)\n',
    );

    const result = await detector.prepareBuild({
      repositoryDirectory,
      containerPort: 5000,
    });
    const dockerfile = await generatedDockerfile();

    expect(result).toMatchObject({ applicationType: 'PYTHON', framework: 'flask' });
    expect(dockerfile).toContain('pip install --no-cache-dir -r requirements.txt');
    expect(dockerfile).toContain(
      'CMD ["gunicorn","--bind","0.0.0.0:5000","app:app"]',
    );
  });

  it('detects a common FastAPI main.py application', async () => {
    await write('requirements.txt', 'fastapi==0.116.0\nuvicorn[standard]>=0.35\n');
    await write(
      'main.py',
      'from fastapi import FastAPI\napp = FastAPI()\n',
    );

    const result = await detector.prepareBuild({
      repositoryDirectory,
      containerPort: 8000,
    });
    const dockerfile = await generatedDockerfile();

    expect(result.framework).toBe('fastapi');
    expect(dockerfile).toContain(
      'CMD ["uvicorn","main:app","--host","0.0.0.0","--port","8000"]',
    );
  });

  it('detects a root Streamlit app.py application', async () => {
    await write('requirements.txt', 'streamlit~=1.49\n');
    await write('app.py', 'import streamlit as st\nst.title("Example")\n');

    const result = await detector.prepareBuild({
      repositoryDirectory,
      containerPort: 8501,
    });
    const dockerfile = await generatedDockerfile();

    expect(result.framework).toBe('streamlit');
    expect(dockerfile).toContain('--server.address=0.0.0.0');
    expect(dockerfile).toContain('--server.port=8501');
  });

  it('supports standard pip-installable pyproject.toml metadata', async () => {
    await write(
      'pyproject.toml',
      [
        '[build-system]',
        'requires = ["setuptools>=68"]',
        'build-backend = "setuptools.build_meta"',
        '',
        '[project]',
        'name = "example-api"',
        'version = "0.1.0"',
        'dependencies = ["fastapi>=0.116", "uvicorn>=0.35"]',
      ].join('\n'),
    );
    await write('main.py', 'from fastapi import FastAPI\napp = FastAPI()\n');

    await detector.prepareBuild({ repositoryDirectory, containerPort: 8000 });
    const dockerfile = await generatedDockerfile();

    expect(dockerfile).toContain('RUN pip install --no-cache-dir .');
    expect(dockerfile).toContain('CMD ["uvicorn","main:app"');
  });

  it('rejects ambiguous Python frameworks instead of guessing', async () => {
    await write('requirements.txt', 'flask\nstreamlit\n');
    await write('app.py', 'from flask import Flask\napp = Flask(__name__)\n');

    await expect(
      detector.prepareBuild({ repositoryDirectory, containerPort: 8000 }),
    ).rejects.toMatchObject({
      statusCode: 422,
      message: 'Python application framework is ambiguous',
    });
  });

  it('returns a clear unsupported error for an unknown repository', async () => {
    await write('README.md', '# Unknown application\n');

    await expect(
      detector.prepareBuild({ repositoryDirectory, containerPort: 8080 }),
    ).rejects.toMatchObject({
      statusCode: 422,
      message: 'Unsupported application type',
    });
  });
});
