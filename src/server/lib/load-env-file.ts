import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const parseLine = (line: string): [string, string] | null => {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const separatorIndex = trimmed.indexOf('=');

  if (separatorIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['\"]|['\"]$/g, '');

  if (!key) {
    return null;
  }

  return [key, value];
};

export const loadEnvFile = (filePath = '.env'): void => {
  const absolutePath = resolve(process.cwd(), filePath);

  if (!existsSync(absolutePath)) {
    return;
  }

  const contents = readFileSync(absolutePath, 'utf-8');
  const lines = contents.split(/\r?\n/);

  for (const line of lines) {
    const parsed = parseLine(line);

    if (!parsed) {
      continue;
    }

    const [key, value] = parsed;

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};
