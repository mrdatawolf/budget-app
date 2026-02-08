#!/usr/bin/env node
/**
 * Server Manager — manages the Hono API server as a child process.
 * Used by dev.js (development) and start.js (production).
 */

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const SERVER_PKG_DIR = path.join(__dirname, '..', 'packages', 'server');

let apiProcess = null;
let restartCount = 0;
let stopping = false;

/**
 * Read a variable from .env.local or .env files.
 */
function readEnvVar(name, defaultValue) {
  const fs = require('fs');
  const envFiles = ['.env.local', '.env'];
  for (const envFile of envFiles) {
    const envPath = path.join(__dirname, '..', envFile);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(new RegExp(`^${name}=(.+)`, 'm'));
      if (match) return match[1].trim();
    }
  }
  if (process.env[name]) return process.env[name];
  return defaultValue;
}

/**
 * Start the Hono API server.
 * @param {object} options
 * @param {'dev'|'prod'} options.mode - dev uses tsx watch, prod uses node
 * @param {number} options.maxRestarts - max auto-restarts on crash (default 3)
 * @param {string} [options.prefix] - log prefix (default '[API]')
 * @returns {ChildProcess}
 */
function startApiServer(options = {}) {
  const { mode = 'dev', maxRestarts = 3, prefix = '\x1b[36m[API]\x1b[0m' } = options;

  let cmd, args, cwd;

  let useShell = false;

  if (mode === 'dev') {
    // Use a single command string with shell to avoid DEP0190 deprecation warning
    cmd = 'npx tsx watch --env-file=../../.env.local src/index.ts';
    args = [];
    cwd = SERVER_PKG_DIR;
    useShell = true;
  } else {
    cmd = process.execPath; // node
    args = [path.join(SERVER_PKG_DIR, 'dist', 'index.js')];
    cwd = SERVER_PKG_DIR;
  }

  console.log(`${prefix} Starting API server (${mode} mode)...`);

  apiProcess = spawn(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: useShell,
    env: { ...process.env },
  });

  // Prefix stdout lines
  apiProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      console.log(`${prefix} ${line}`);
    }
  });

  // Prefix stderr lines
  apiProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      console.error(`${prefix} ${line}`);
    }
  });

  apiProcess.on('close', (code) => {
    apiProcess = null;
    if (stopping) return;

    if (code !== 0 && code !== null) {
      console.error(`${prefix} API server exited with code ${code}`);
      if (restartCount < maxRestarts) {
        restartCount++;
        console.log(`${prefix} Restarting (attempt ${restartCount}/${maxRestarts})...`);
        setTimeout(() => startApiServer(options), 1000);
      } else {
        console.error(`${prefix} Max restarts reached (${maxRestarts}). Giving up.`);
        process.exit(1);
      }
    }
  });

  return apiProcess;
}

/**
 * Poll the /health endpoint until it responds 200.
 * @param {number} port
 * @param {number} timeoutMs - max wait time (default 15000)
 * @returns {Promise<boolean>}
 */
function waitForHealth(port, timeoutMs = 15000) {
  const prefix = '\x1b[36m[API]\x1b[0m';
  const start = Date.now();
  const interval = 500;

  return new Promise((resolve, reject) => {
    function check() {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`API server health check timed out after ${timeoutMs}ms`));
        return;
      }

      const req = http.get(`http://localhost:${port}/health`, (res) => {
        if (res.statusCode === 200) {
          console.log(`${prefix} Health check passed`);
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
 * Gracefully stop the API server.
 * @returns {Promise<void>}
 */
function stopApiServer() {
  stopping = true;
  return new Promise((resolve) => {
    if (!apiProcess) {
      resolve();
      return;
    }

    const prefix = '\x1b[36m[API]\x1b[0m';
    console.log(`${prefix} Shutting down API server...`);

    // Force kill after 5 seconds
    const forceKillTimer = setTimeout(() => {
      if (apiProcess) {
        console.log(`${prefix} Force killing API server...`);
        apiProcess.kill('SIGKILL');
      }
      resolve();
    }, 5000);

    apiProcess.on('close', () => {
      clearTimeout(forceKillTimer);
      console.log(`${prefix} API server stopped`);
      resolve();
    });

    // On Windows, SIGTERM doesn't work well — use tree-kill approach
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', apiProcess.pid.toString(), '/f', '/t'], {
        stdio: 'ignore',
      });
    } else {
      apiProcess.kill('SIGTERM');
    }
  });
}

/**
 * Get the current API process (if running).
 */
function getApiProcess() {
  return apiProcess;
}

module.exports = {
  readEnvVar,
  startApiServer,
  waitForHealth,
  stopApiServer,
  getApiProcess,
};
