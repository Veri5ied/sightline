import { spawn } from 'node:child_process';

const server = spawn('pnpm', ['run', 'dev:server'], {
  stdio: 'inherit',
  shell: true
});

const client = spawn('pnpm', ['run', 'dev:client'], {
  stdio: 'inherit',
  shell: true
});

const shutdown = (signal) => {
  server.kill(signal);
  client.kill(signal);
};

process.on('SIGINT', () => {
  shutdown('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
  process.exit(0);
});

server.on('exit', (code) => {
  if (code !== 0) {
    client.kill('SIGTERM');
    process.exit(code ?? 1);
  }
});

client.on('exit', (code) => {
  if (code !== 0) {
    server.kill('SIGTERM');
    process.exit(code ?? 1);
  }
});
