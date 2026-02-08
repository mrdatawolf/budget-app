#!/usr/bin/env node
/**
 * Production server — starts both the Hono API server and Next.js standalone
 * server from a single command (`pnpm start`).
 *
 * Requires:
 *   - `pnpm server:build` (builds packages/server/dist/)
 *   - `pnpm build` (builds .next/standalone/)
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { readEnvVar, startApiServer, waitForHealth, stopApiServer } = require('./server-manager');

const WEB_PREFIX = '\x1b[35m[WEB]\x1b[0m';

const apiPort = parseInt(readEnvVar('API_PORT', '3001'), 10);
const serverPort = parseInt(readEnvVar('SERVER_PORT', '3000'), 10);

let nextProcess = null;
let shuttingDown = false;

function startNextProd() {
  // Next.js standalone server location
  const standaloneServer = path.join(__dirname, '..', '.next', 'standalone', 'server.js');

  if (!fs.existsSync(standaloneServer)) {
    console.error(`${WEB_PREFIX} Standalone server not found at ${standaloneServer}`);
    console.error(`${WEB_PREFIX} Run "pnpm build" first to create the standalone build.`);
    process.exit(1);
  }

  console.log(`${WEB_PREFIX} Starting Next.js production server on port ${serverPort}...`);

  nextProcess = spawn(process.execPath, [standaloneServer], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: serverPort.toString(),
      HOSTNAME: '0.0.0.0',
    },
  });

  nextProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      console.log(`${WEB_PREFIX} ${line}`);
    }
  });

  nextProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      console.error(`${WEB_PREFIX} ${line}`);
    }
  });

  nextProcess.on('close', (code) => {
    nextProcess = null;
    if (!shuttingDown) {
      console.log(`${WEB_PREFIX} Next.js exited with code ${code}`);
      shutdown(code || 1);
    }
  });
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log('\nShutting down...');

  if (nextProcess) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', nextProcess.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
    } else {
      nextProcess.kill('SIGTERM');
    }
  }

  await stopApiServer();

  process.exit(exitCode);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  // Verify server build exists
  const serverDist = path.join(__dirname, '..', 'packages', 'server', 'dist', 'index.js');
  if (!fs.existsSync(serverDist)) {
    console.error('API server build not found. Run "pnpm server:build" first.');
    process.exit(1);
  }

  console.log(`Starting production environment...`);
  console.log(`  API server port: ${apiPort}`);
  console.log(`  Web client port: ${serverPort}`);
  console.log('');

  try {
    // 1. Start the API server (production mode)
    startApiServer({ mode: 'prod' });

    // 2. Wait for health check
    await waitForHealth(apiPort);

    // 3. Start Next.js standalone server
    startNextProd();
  } catch (err) {
    console.error(`Startup failed: ${err.message}`);
    await shutdown(1);
  }
}

main();
