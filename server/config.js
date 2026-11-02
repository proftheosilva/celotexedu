import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function readRuntimeConfig(env = process.env) {
  let linkedProject = {};
  if (env.INSFORGE_URL && env.INSFORGE_API_KEY) {
    linkedProject = { oss_host: env.INSFORGE_URL, api_key: env.INSFORGE_API_KEY };
  } else {
    const projectFile = path.join(projectRoot, '.insforge', 'project.json');
    if (fs.existsSync(projectFile)) {
      linkedProject = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
    }
  }

  const baseUrl = String(linkedProject.oss_host || env.INSFORGE_URL || '').trim();
  const apiKey = String(linkedProject.api_key || env.INSFORGE_API_KEY || '').trim();
  if (!baseUrl || !apiKey) {
    throw new Error('Configure INSFORGE_URL e INSFORGE_API_KEY no .env, ou vincule o projeto pela InsForge CLI.');
  }
  return {
    baseUrl,
    apiKey,
    port: Number.parseInt(env.PORT || '4180', 10),
    host: env.HOST || '127.0.0.1',
    environment: env.NODE_ENV || 'development',
  };
}

export { projectRoot };
