import { resolve } from 'node:path';

export interface ServerEnv {
  port: number;
  corsOrigin: string;
  geminiApiKey: string;
  geminiLiveModel: string;
  staticDir: string;
}

const parsePort = (value: string | undefined): number => {
  if (!value) {
    return 8080;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return 8080;
  }

  return parsed;
};

export const loadEnv = (): ServerEnv => ({
  port: parsePort(process.env.PORT),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiLiveModel: process.env.GEMINI_LIVE_MODEL ?? 'gemini-2.5-flash-native-audio-preview-12-2025',
  staticDir: process.env.STATIC_DIR ?? resolve(process.cwd(), 'dist/client')
});
