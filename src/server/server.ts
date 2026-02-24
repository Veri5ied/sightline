import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket as WsSocket } from 'ws';
import type { RawData } from 'ws';
import { loadEnvFile } from './lib/load-env-file.js';
import { loadEnv } from './lib/env.js';
import { sendJson } from './lib/send-json.js';
import { serveStatic } from './lib/serve-static.js';
import { parseClientMessage } from './lib/parse-client-message.js';
import { LiveSessionBridge } from './live/live-session-bridge.js';
import type { ServerSocketMessage } from '../shared/types/socket-types.js';

loadEnvFile();
const env = loadEnv();

const setCorsHeaders = (response: ServerResponse): void => {
  response.setHeader('Access-Control-Allow-Origin', env.corsOrigin);
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
};

const handleHttp = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.end();
    return;
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, {
      status: 'ok',
      model: env.geminiLiveModel,
      hasApiKey: Boolean(env.geminiApiKey),
      timestamp: new Date().toISOString()
    });
    return;
  }

  const servedStatic = await serveStatic(url.pathname, response, env.staticDir);

  if (servedStatic) {
    return;
  }

  sendJson(response, 404, {
    message: 'Not found.'
  });
};

const server = createServer((request, response) => {
  handleHttp(request, response).catch((error: unknown) => {
    sendJson(response, 500, {
      message: 'Unexpected server error.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  });
});

const wsServer = new WebSocketServer({
  noServer: true
});

const encode = (message: ServerSocketMessage): string => JSON.stringify(message);

const sendWsMessage = (socket: WsSocket, message: ServerSocketMessage): void => {
  if (socket.readyState === WsSocket.OPEN) {
    socket.send(encode(message));
  }
};

const rawDataToString = (value: RawData): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return Buffer.concat(value).toString('utf-8');
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('utf-8');
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value).toString('utf-8');
  }

  return '';
};

wsServer.on('connection', (socket) => {
  const bridge = new LiveSessionBridge({
    apiKey: env.geminiApiKey,
    model: env.geminiLiveModel,
    send: (message: ServerSocketMessage) => sendWsMessage(socket, message)
  });

  sendWsMessage(socket, {
    type: 'server.ready',
    model: env.geminiLiveModel
  });

  socket.on('message', async (rawData) => {
    const messageText = rawDataToString(rawData);
    const parsed = parseClientMessage(messageText);

    if (!parsed) {
      sendWsMessage(socket, {
        type: 'live.error',
        message: 'Invalid websocket message payload.'
      });
      return;
    }

    await bridge.handleClientMessage(parsed);
  });

  socket.on('close', () => {
    bridge.disconnect('Socket closed.');
  });
});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (url.pathname !== '/ws/live') {
    socket.destroy();
    return;
  }

  wsServer.handleUpgrade(request, socket, head, (websocket) => {
    wsServer.emit('connection', websocket, request);
  });
});

server.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`live-agent server running on http://localhost:${env.port}`);
});
