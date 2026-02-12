#!/usr/bin/env node
/**
 * Production Server Startup Script
 *
 * Starts both the Hono API server and Next.js standalone server.
 * Designed for the installed/standalone environment (not the dev monorepo).
 *
 * Layout expectations:
 *   ./api-server/index.mjs   - Bundled Hono API server
 *   ./server.js              - Next.js standalone server
 *   ./data/                  - PGlite database directory
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Directory where this script lives (the install root)
const APP_DIR = __dirname;

// Default ports — must match what was baked into next.config.ts rewrites
const DEFAULT_API_PORT = 3401;
const DEFAULT_WEB_PORT = 3400;

// ANSI color codes
const API_PREFIX = '\x1b[36m[API]\x1b[0m';
const WEB_PREFIX = '\x1b[35m[WEB]\x1b[0m';

let apiProcess = null;
let webProcess = null;
let shuttingDown = false;

/**
 * Read a key=value from .env file in the app directory.
 */
function readEnvVar(name, defaultValue) {
  const envPath = path.join(APP_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(new RegExp(`^${name}=(.+)`, 'm'));
    if (match) return match[1].trim();
  }
  if (process.env[name]) return process.env[name];
  return defaultValue;
}

/**
 * Poll the /health endpoint until it responds 200.
 */
function waitForHealth(port, timeoutMs = 20000) {
  const start = Date.now();
  const interval = 500;

  return new Promise((resolve, reject) => {
    function check() {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`API health check timed out after ${timeoutMs}ms`));
        return;
      }

      const req = http.get(`http://localhost:${port}/health`, (res) => {
        if (res.statusCode === 200) {
          console.log(`${API_PREFIX} Health check passed`);
          resolve(true);
        } else {
          setTimeout(check, interval);
        }
      });

      req.on('error', () => {
        setTimeout(check, interval);
      });

      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(check, interval);
      });
    }

    check();
  });
}

/**
 * Write PID file so stop.bat can find us.
 */
function writePidFile() {
  const dataDir = path.join(APP_DIR, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(path.join(dataDir, '.pid'), process.pid.toString(), 'utf8');
}

/**
 * Remove PID file on shutdown.
 */
function removePidFile() {
  const pidPath = path.join(APP_DIR, 'data', '.pid');
  try {
    if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Start the Hono API server.
 */
function startApiServer(apiPort) {
  const serverEntry = path.join(APP_DIR, 'api-server', 'index.mjs');

  if (!fs.existsSync(serverEntry)) {
    console.error(`${API_PREFIX} API server not found at ${serverEntry}`);
    process.exit(1);
  }

  console.log(`${API_PREFIX} Starting API server on port ${apiPort}...`);

  apiProcess = spawn(process.execPath, [serverEntry], {
    cwd: path.join(APP_DIR, 'api-server'),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      API_PORT: apiPort.toString(),
      PGLITE_DB_LOCATION: path.join(APP_DIR, 'data', 'budget-local'),
    },
  });

  apiProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      console.log(`${API_PREFIX} ${line}`);
    }
  });

  apiProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      console.error(`${API_PREFIX} ${line}`);
    }
  });

  apiProcess.on('close', (code) => {
    apiProcess = null;
    if (!shuttingDown) {
      console.error(`${API_PREFIX} API server exited unexpectedly (code ${code})`);
      shutdown(1);
    }
  });
}

/**
 * Start the Next.js standalone server.
 */
function startWebServer(webPort) {
  const serverEntry = path.join(APP_DIR, 'server.js');

  if (!fs.existsSync(serverEntry)) {
    console.error(`${WEB_PREFIX} Next.js server not found at ${serverEntry}`);
    process.exit(1);
  }

  console.log(`${WEB_PREFIX} Starting web server on port ${webPort}...`);

  webProcess = spawn(process.execPath, [serverEntry], {
    cwd: APP_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: webPort.toString(),
      HOSTNAME: '0.0.0.0',
    },
  });

  webProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      console.log(`${WEB_PREFIX} ${line}`);
    }
  });

  webProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      console.error(`${WEB_PREFIX} ${line}`);
    }
  });

  webProcess.on('close', (code) => {
    webProcess = null;
    if (!shuttingDown) {
      console.log(`${WEB_PREFIX} Web server exited (code ${code})`);
      shutdown(code || 1);
    }
  });
}

/**
 * Open the user's default browser.
 */
function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      execSync(`start "" "${url}"`, { stdio: 'ignore', shell: true });
    } else if (process.platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
    }
  } catch {
    console.log(`Open your browser to: ${url}`);
  }
}

/**
 * Kill a child process tree (cross-platform).
 */
function killChild(child) {
  if (!child) return;
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
    } catch { /* ignore */ }
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch { /* ignore */ }
  }
}

/**
 * Gracefully shut down both servers.
 */
async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log('\nShutting down...');

  killChild(webProcess);
  killChild(apiProcess);

  removePidFile();

  // Give processes time to die
  setTimeout(() => process.exit(exitCode), 1000);
}

// Handle shutdown signals
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

/**
 * Main entry point.
 */
async function main() {
  const apiPort = parseInt(readEnvVar('API_PORT', String(DEFAULT_API_PORT)), 10);
  const webPort = parseInt(readEnvVar('SERVER_PORT', String(DEFAULT_WEB_PORT)), 10);

  console.log('');
  console.log('========================================');
  console.log('        Budget App Server');
  console.log('========================================');
  console.log('');
  console.log(`  API server:  http://localhost:${apiPort}`);
  console.log(`  Web app:     http://localhost:${webPort}`);
  console.log(`  Data:        ${path.join(APP_DIR, 'data', 'budget-local')}`);
  console.log('');
  console.log('  Press Ctrl+C to stop');
  console.log('');

  // Ensure data directory exists
  const dataDir = path.join(APP_DIR, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  writePidFile();

  try {
    // 1. Start API server
    startApiServer(apiPort);

    // 2. Wait for API server health check
    await waitForHealth(apiPort);

    // 3. Start Next.js web server
    startWebServer(webPort);

    // 4. Open browser after a short delay (let Next.js initialize)
    setTimeout(() => {
      openBrowser(`http://localhost:${webPort}`);
    }, 2000);

  } catch (err) {
    console.error(`Startup failed: ${err.message}`);
    await shutdown(1);
  }
}

main();
