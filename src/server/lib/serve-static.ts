import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import type { ServerResponse } from 'node:http';

const mimeMap: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const resolveSafePath = (rootDir: string, requestPath: string): string | null => {
  const normalizedPath = normalize(requestPath).replace(/^\.\.(?:\/|\\|$)/, '');
  const absoluteTarget = resolve(rootDir, `.${normalizedPath}`);

  if (!absoluteTarget.startsWith(resolve(rootDir))) {
    return null;
  }

  return absoluteTarget;
};

const writeFileResponse = async (response: ServerResponse, filePath: string): Promise<boolean> => {
  try {
    const buffer = await readFile(filePath);
    response.statusCode = 200;
    response.setHeader('Content-Type', mimeMap[extname(filePath)] ?? 'application/octet-stream');
    response.end(buffer);
    return true;
  } catch {
    return false;
  }
};

export const serveStatic = async (
  requestPath: string,
  response: ServerResponse,
  staticDir: string
): Promise<boolean> => {
  try {
    await access(staticDir, constants.R_OK);
  } catch {
    return false;
  }

  const pathname = requestPath === '/' ? '/index.html' : requestPath;
  const targetFile = resolveSafePath(staticDir, pathname);

  if (!targetFile) {
    response.statusCode = 403;
    response.end('Forbidden');
    return true;
  }

  if (await writeFileResponse(response, targetFile)) {
    return true;
  }

  if (!extname(targetFile)) {
    const fallback = join(staticDir, 'index.html');
    return writeFileResponse(response, fallback);
  }

  return false;
};
