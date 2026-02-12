/**
 * Budget App Cross-Platform Build Script
 *
 * Builds distribution packages for Linux and macOS (and optionally Windows).
 * Can run from any OS — downloads the target platform's Node.js binary and
 * generates platform-appropriate shell scripts.
 *
 * The app code (Next.js standalone + esbuild API server bundle) is
 * platform-agnostic. Only the Node.js binary and startup scripts differ.
 *
 * Usage:
 *   node installer/build-cross-platform.js --platform linux   [--skip-build] [--skip-archive]
 *   node installer/build-cross-platform.js --platform darwin   [--skip-build] [--skip-archive]
 *   node installer/build-cross-platform.js --platform all      [--skip-build] [--skip-archive]
 *
 * Prerequisites:
 *   - Node.js 20+ and pnpm (for building)
 *   - System tar (Windows 10+, Linux, macOS — no extra install needed)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const {
  APP_VERSION, NODE_VERSION, PROJECT_ROOT, DIST_DIR, STANDALONE_DIR,
  NODE_CACHE_DIR, DISTRIBUTE_DIR, PLATFORM_CONFIG, colors,
  log, logStep, logSuccess, logWarning, logError,
  downloadFile, copyDir, cleanDir, getDirSize,
  stripUnnecessaryModules, fixPnpmLayout, createTarGz,
} = require('./build-utils');

// Parse command line arguments
const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const skipArchive = args.includes('--skip-archive');

function getArgValue(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

const platformArg = getArgValue('--platform');

if (!platformArg) {
  logError('Missing --platform flag. Usage: --platform linux|darwin|all');
  process.exit(1);
}

const targetPlatforms = platformArg === 'all'
  ? ['linux', 'darwin']
  : [platformArg];

for (const p of targetPlatforms) {
  if (!PLATFORM_CONFIG[p]) {
    logError(`Unknown platform: ${p}. Supported: linux, darwin, all`);
    process.exit(1);
  }
}

// =============================================================================
// Build Steps (platform-agnostic — same as build-installer.js)
// =============================================================================

/**
 * Step 1: Build Next.js in standalone mode
 */
async function buildNextJs() {
  logStep('1/6', 'Building Next.js application...');

  if (skipBuild) {
    logWarning('Skipping build (--skip-build flag)');
    return;
  }

  const nextDir = path.join(PROJECT_ROOT, '.next');
  if (fs.existsSync(nextDir)) {
    log('  Cleaning previous build...');
    fs.rmSync(nextDir, { recursive: true, force: true });
  }

  log('  Running next build...');
  execSync('pnpm build', {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });

  logSuccess('Next.js build complete');
}

/**
 * Step 2: Bundle API server with esbuild
 */
async function bundleApiServer() {
  logStep('2/6', 'Bundling API server...');

  if (skipBuild) {
    logWarning('Skipping build (--skip-build flag)');
    return;
  }

  const outDir = path.join(STANDALONE_DIR, 'api-server');
  fs.mkdirSync(outDir, { recursive: true });

  const entryPoint = path.join(PROJECT_ROOT, 'packages', 'server', 'src', 'index.ts');

  if (!fs.existsSync(entryPoint)) {
    throw new Error(`API server entry point not found: ${entryPoint}`);
  }

  log('  Running esbuild...');
  execSync(
    [
      'npx esbuild',
      `"${entryPoint}"`,
      '--bundle',
      '--platform=node',
      '--target=node20',
      '--format=esm',
      `--outfile="${path.join(outDir, 'index.mjs')}"`,
      '--external:@electric-sql/pglite',
    ].join(' '),
    {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: { ...process.env },
    }
  );

  logSuccess('API server bundled');

  // Copy PGlite package (WASM files needed at runtime)
  log('  Copying PGlite runtime...');
  const pgliteSrc = path.join(PROJECT_ROOT, 'node_modules', '@electric-sql', 'pglite');
  const pgliteDest = path.join(outDir, 'node_modules', '@electric-sql', 'pglite');

  if (!fs.existsSync(pgliteSrc)) {
    throw new Error(`PGlite package not found at ${pgliteSrc}`);
  }

  copyDir(pgliteSrc, pgliteDest);
  logSuccess('PGlite runtime copied');
}

/**
 * Detect the Next.js standalone project directory.
 * Next.js 16+ nests standalone output under a project-name subdirectory.
 */
function findStandaloneRoot(standaloneDir) {
  if (fs.existsSync(path.join(standaloneDir, 'server.js'))) {
    return standaloneDir;
  }

  const entries = fs.readdirSync(standaloneDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const candidate = path.join(standaloneDir, entry.name, 'server.js');
      if (fs.existsSync(candidate)) {
        log(`  Detected nested standalone layout: ${entry.name}/`);
        return path.join(standaloneDir, entry.name);
      }
    }
  }

  throw new Error(
    'Could not find server.js in Next.js standalone output. ' +
    'Check that next.config.ts has output: "standalone"'
  );
}

/**
 * Step 3: Prepare standalone directory (platform-agnostic app files)
 */
async function prepareStandalone() {
  logStep('3/6', 'Preparing standalone package...');

  const nextStandalone = path.join(PROJECT_ROOT, '.next', 'standalone');
  const nextStatic = path.join(PROJECT_ROOT, '.next', 'static');
  const publicDir = path.join(PROJECT_ROOT, 'public');

  if (!fs.existsSync(nextStandalone)) {
    throw new Error(
      'Next.js standalone build not found. Make sure next.config.ts has output: "standalone"'
    );
  }

  const standaloneRoot = findStandaloneRoot(nextStandalone);

  log('  Copying standalone server files...');
  const standaloneEntries = fs.readdirSync(standaloneRoot, { withFileTypes: true });
  for (const entry of standaloneEntries) {
    const srcPath = path.join(standaloneRoot, entry.name);
    const destPath = path.join(STANDALONE_DIR, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  const destStatic = path.join(STANDALONE_DIR, '.next', 'static');
  if (fs.existsSync(nextStatic)) {
    log('  Copying static assets...');
    copyDir(nextStatic, destStatic);
  }

  const destPublic = path.join(STANDALONE_DIR, 'public');
  if (fs.existsSync(publicDir)) {
    log('  Copying public assets...');
    copyDir(publicDir, destPublic);
  }

  log('  Fixing pnpm module layout...');
  fixPnpmLayout(path.join(STANDALONE_DIR, 'node_modules'));

  logSuccess('Standalone package prepared');
}

// =============================================================================
// Platform-Specific Steps
// =============================================================================

/**
 * Step 4: Download Node.js for target platform
 */
async function downloadNodeForPlatform(platform) {
  const config = PLATFORM_CONFIG[platform];
  const nodeDir = path.join(DIST_DIR, `node-${platform}`);
  const nodeBinaryPath = path.join(nodeDir, config.nodeBinary);

  logStep('4/6', `Downloading Node.js ${NODE_VERSION} for ${platform}...`);

  if (fs.existsSync(nodeBinaryPath)) {
    logSuccess(`Node.js ${NODE_VERSION} for ${platform} already available`);
    return;
  }

  fs.mkdirSync(NODE_CACHE_DIR, { recursive: true });
  fs.mkdirSync(nodeDir, { recursive: true });

  const cacheFilePath = path.join(NODE_CACHE_DIR, config.nodeFilename(NODE_VERSION));

  // Download if not cached
  if (!fs.existsSync(cacheFilePath)) {
    const url = config.nodeUrl(NODE_VERSION);
    log(`  Downloading from ${url}...`);
    await downloadFile(url, cacheFilePath);
    logSuccess('Download complete');
  } else {
    logSuccess('Using cached Node.js download');
  }

  // Extract
  const tempExtractDir = path.join(DIST_DIR, `node-extract-${platform}`);
  cleanDir(tempExtractDir);
  config.extract(cacheFilePath, tempExtractDir);

  // Find the node binary in extracted folder
  const extractedFolder = fs.readdirSync(tempExtractDir)[0];
  const extractedBase = path.join(tempExtractDir, extractedFolder);

  let extractedBinary;
  if (platform === 'win32') {
    extractedBinary = path.join(extractedBase, 'node.exe');
  } else {
    // Linux/macOS tarballs have bin/node inside
    extractedBinary = path.join(extractedBase, 'bin', 'node');
  }

  if (fs.existsSync(extractedBinary)) {
    fs.copyFileSync(extractedBinary, nodeBinaryPath);
    logSuccess(`Node.js ${NODE_VERSION} for ${platform} extracted`);
  } else {
    throw new Error(`Could not find node binary in extracted archive at ${extractedBinary}`);
  }

  // Cleanup
  fs.rmSync(tempExtractDir, { recursive: true, force: true });
}

// =============================================================================
// Shell Script Generators
// =============================================================================

/**
 * Generate a platform-aware Node.js startup script for the Server package.
 */
function generateServerStartJs() {
  return `#!/usr/bin/env node
/**
 * Budget App API Server - Standalone Startup
 * Starts the Hono API server with PGlite local database.
 */
var spawn = require('child_process').spawn;
var path = require('path');
var fs = require('fs');

var APP_DIR = __dirname;
var DEFAULT_API_PORT = 3401;
var isWindows = process.platform === 'win32';

function readEnvVar(name, defaultValue) {
  var envPath = path.join(APP_DIR, '.env');
  if (fs.existsSync(envPath)) {
    var content = fs.readFileSync(envPath, 'utf8');
    var match = content.match(new RegExp('^' + name + '=(.+)', 'm'));
    if (match) return match[1].trim();
  }
  if (process.env[name]) return process.env[name];
  return defaultValue;
}

function writePidFile() {
  var dataDir = path.join(APP_DIR, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, '.pid'), process.pid.toString(), 'utf8');
}

function removePidFile() {
  try { fs.unlinkSync(path.join(APP_DIR, 'data', '.pid')); } catch (e) {}
}

function killChild(child) {
  if (!child) return;
  if (isWindows) {
    try { spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'], { stdio: 'ignore' }); } catch (e) {}
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch (e) {}
  }
}

function main() {
  var apiPort = parseInt(readEnvVar('API_PORT', String(DEFAULT_API_PORT)), 10);

  console.log('');
  console.log('========================================');
  console.log('     Budget App API Server');
  console.log('========================================');
  console.log('');
  console.log('  API server:  http://localhost:' + apiPort);
  console.log('  Health:      http://localhost:' + apiPort + '/health');
  console.log('  Data:        ' + path.join(APP_DIR, 'data', 'budget-local'));
  console.log('');
  console.log('  Press Ctrl+C to stop');
  console.log('');

  var dataDir = path.join(APP_DIR, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  writePidFile();

  var serverEntry = path.join(APP_DIR, 'api-server', 'index.mjs');
  if (!fs.existsSync(serverEntry)) {
    console.error('API server not found at ' + serverEntry);
    process.exit(1);
  }

  var child = spawn(process.execPath, [serverEntry], {
    cwd: path.join(APP_DIR, 'api-server'),
    stdio: 'inherit',
    detached: !isWindows,
    env: Object.assign({}, process.env, {
      NODE_ENV: 'production',
      API_PORT: apiPort.toString(),
      PGLITE_DB_LOCATION: path.join(APP_DIR, 'data', 'budget-local'),
    }),
  });

  child.on('close', function (code) {
    removePidFile();
    process.exit(code || 0);
  });

  function shutdown() {
    killChild(child);
    removePidFile();
    setTimeout(function () { process.exit(0); }, 1000);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
`;
}

/**
 * Generate a platform-aware Node.js startup script for the Client package.
 */
function generateClientStartJs() {
  return `#!/usr/bin/env node
/**
 * Budget App Web Client - Standalone Startup
 * Starts the Next.js web server.
 */
var spawn = require('child_process').spawn;
var execSync = require('child_process').execSync;
var path = require('path');
var fs = require('fs');

var APP_DIR = __dirname;
var DEFAULT_WEB_PORT = 3400;
var DEFAULT_API_PORT = 3401;
var isWindows = process.platform === 'win32';

function readEnvVar(name, defaultValue) {
  var envPath = path.join(APP_DIR, '.env');
  if (fs.existsSync(envPath)) {
    var content = fs.readFileSync(envPath, 'utf8');
    var match = content.match(new RegExp('^' + name + '=(.+)', 'm'));
    if (match) return match[1].trim();
  }
  if (process.env[name]) return process.env[name];
  return defaultValue;
}

function writePidFile() {
  var dataDir = path.join(APP_DIR, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, '.pid'), process.pid.toString(), 'utf8');
}

function removePidFile() {
  try { fs.unlinkSync(path.join(APP_DIR, 'data', '.pid')); } catch (e) {}
}

function killChild(child) {
  if (!child) return;
  if (isWindows) {
    try { spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'], { stdio: 'ignore' }); } catch (e) {}
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch (e) {}
  }
}

function openBrowser(url) {
  try {
    if (isWindows) {
      execSync('start "" "' + url + '"', { stdio: 'ignore', shell: true });
    } else if (process.platform === 'darwin') {
      execSync('open "' + url + '"', { stdio: 'ignore' });
    } else {
      execSync('xdg-open "' + url + '"', { stdio: 'ignore' });
    }
  } catch (e) {
    console.log('Open your browser to: ' + url);
  }
}

function main() {
  var webPort = parseInt(readEnvVar('SERVER_PORT', String(DEFAULT_WEB_PORT)), 10);
  var apiPort = parseInt(readEnvVar('API_PORT', String(DEFAULT_API_PORT)), 10);

  console.log('');
  console.log('========================================');
  console.log('     Budget App Web Client');
  console.log('========================================');
  console.log('');
  console.log('  Web app:     http://localhost:' + webPort);
  console.log('  API server:  http://localhost:' + apiPort + ' (must be running separately)');
  console.log('');
  console.log('  Press Ctrl+C to stop');
  console.log('');

  var serverEntry = path.join(APP_DIR, 'server.js');
  if (!fs.existsSync(serverEntry)) {
    console.error('Next.js server not found at ' + serverEntry);
    process.exit(1);
  }

  writePidFile();

  var child = spawn(process.execPath, [serverEntry], {
    cwd: APP_DIR,
    stdio: 'inherit',
    detached: !isWindows,
    env: Object.assign({}, process.env, {
      NODE_ENV: 'production',
      PORT: webPort.toString(),
      HOSTNAME: '0.0.0.0',
    }),
  });

  setTimeout(function () { openBrowser('http://localhost:' + webPort); }, 2000);

  child.on('close', function (code) {
    removePidFile();
    process.exit(code || 0);
  });

  function shutdown() {
    killChild(child);
    removePidFile();
    setTimeout(function () { process.exit(0); }, 1000);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
`;
}

/**
 * Generate a platform-aware Node.js startup script for the Full (combined) package.
 */
function generateFullStartJs() {
  return `#!/usr/bin/env node
/**
 * Budget App - Combined Startup
 * Starts the Hono API server, waits for health, then starts the Next.js web client.
 */
var spawn = require('child_process').spawn;
var execSync = require('child_process').execSync;
var path = require('path');
var fs = require('fs');
var http = require('http');

var APP_DIR = __dirname;
var DEFAULT_WEB_PORT = 3400;
var DEFAULT_API_PORT = 3401;
var isWindows = process.platform === 'win32';

var API_PREFIX = '\\x1b[36m[API]\\x1b[0m';
var WEB_PREFIX = '\\x1b[35m[WEB]\\x1b[0m';

function readEnvVar(name, defaultValue) {
  var envPath = path.join(APP_DIR, '.env');
  if (fs.existsSync(envPath)) {
    var content = fs.readFileSync(envPath, 'utf8');
    var match = content.match(new RegExp('^' + name + '=(.+)', 'm'));
    if (match) return match[1].trim();
  }
  if (process.env[name]) return process.env[name];
  return defaultValue;
}

function writePidFile() {
  var dataDir = path.join(APP_DIR, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, '.pid'), process.pid.toString(), 'utf8');
}

function removePidFile() {
  try { fs.unlinkSync(path.join(APP_DIR, 'data', '.pid')); } catch (e) {}
}

function killChild(child) {
  if (!child) return;
  if (isWindows) {
    try { spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'], { stdio: 'ignore' }); } catch (e) {}
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch (e) {}
  }
}

function openBrowser(url) {
  try {
    if (isWindows) {
      execSync('start "" "' + url + '"', { stdio: 'ignore', shell: true });
    } else if (process.platform === 'darwin') {
      execSync('open "' + url + '"', { stdio: 'ignore' });
    } else {
      execSync('xdg-open "' + url + '"', { stdio: 'ignore' });
    }
  } catch (e) {
    console.log('Open your browser to: ' + url);
  }
}

function waitForHealth(port, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  var start = Date.now();
  var interval = 500;

  return new Promise(function (resolve, reject) {
    function check() {
      if (Date.now() - start > timeoutMs) {
        reject(new Error('API server health check timed out after ' + timeoutMs + 'ms'));
        return;
      }

      var req = http.get('http://localhost:' + port + '/health', function (res) {
        if (res.statusCode === 200) {
          console.log(API_PREFIX + ' Health check passed');
          resolve(true);
        } else {
          setTimeout(check, interval);
        }
      });

      req.on('error', function () {
        setTimeout(check, interval);
      });

      req.setTimeout(2000, function () {
        req.destroy();
        setTimeout(check, interval);
      });
    }

    check();
  });
}

var apiChild = null;
var webChild = null;
var shuttingDown = false;

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  exitCode = exitCode || 0;

  console.log('');
  console.log('Shutting down...');

  killChild(webChild);
  killChild(apiChild);

  removePidFile();
  setTimeout(function () { process.exit(exitCode); }, 1000);
}

async function main() {
  var webPort = parseInt(readEnvVar('SERVER_PORT', String(DEFAULT_WEB_PORT)), 10);
  var apiPort = parseInt(readEnvVar('API_PORT', String(DEFAULT_API_PORT)), 10);

  console.log('');
  console.log('========================================');
  console.log('           Budget App');
  console.log('========================================');
  console.log('');
  console.log('  Web app:     http://localhost:' + webPort);
  console.log('  API server:  http://localhost:' + apiPort);
  console.log('  Data:        ' + path.join(APP_DIR, 'data', 'budget-local'));
  console.log('');
  console.log('  Press Ctrl+C to stop');
  console.log('');

  var dataDir = path.join(APP_DIR, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  writePidFile();

  // 1. Start API server
  var serverEntry = path.join(APP_DIR, 'api-server', 'index.mjs');
  if (!fs.existsSync(serverEntry)) {
    console.error('API server not found at ' + serverEntry);
    process.exit(1);
  }

  console.log(API_PREFIX + ' Starting API server...');
  apiChild = spawn(process.execPath, [serverEntry], {
    cwd: path.join(APP_DIR, 'api-server'),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !isWindows,
    env: Object.assign({}, process.env, {
      NODE_ENV: 'production',
      API_PORT: apiPort.toString(),
      PGLITE_DB_LOCATION: path.join(APP_DIR, 'data', 'budget-local'),
    }),
  });

  apiChild.stdout.on('data', function (data) {
    var lines = data.toString().split('\\n').filter(Boolean);
    for (var i = 0; i < lines.length; i++) console.log(API_PREFIX + ' ' + lines[i]);
  });
  apiChild.stderr.on('data', function (data) {
    var lines = data.toString().split('\\n').filter(Boolean);
    for (var i = 0; i < lines.length; i++) console.error(API_PREFIX + ' ' + lines[i]);
  });
  apiChild.on('close', function (code) {
    apiChild = null;
    if (!shuttingDown) {
      console.error(API_PREFIX + ' API server exited with code ' + code);
      shutdown(code || 1);
    }
  });

  // 2. Wait for health check
  try {
    await waitForHealth(apiPort);
  } catch (err) {
    console.error('Failed to start API server: ' + err.message);
    shutdown(1);
    return;
  }

  // 3. Start Next.js web client
  var clientEntry = path.join(APP_DIR, 'server.js');
  if (!fs.existsSync(clientEntry)) {
    console.error('Next.js server not found at ' + clientEntry);
    shutdown(1);
    return;
  }

  console.log(WEB_PREFIX + ' Starting web client...');
  webChild = spawn(process.execPath, [clientEntry], {
    cwd: APP_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !isWindows,
    env: Object.assign({}, process.env, {
      NODE_ENV: 'production',
      PORT: webPort.toString(),
      HOSTNAME: '0.0.0.0',
    }),
  });

  webChild.stdout.on('data', function (data) {
    var lines = data.toString().split('\\n').filter(Boolean);
    for (var i = 0; i < lines.length; i++) console.log(WEB_PREFIX + ' ' + lines[i]);
  });
  webChild.stderr.on('data', function (data) {
    var lines = data.toString().split('\\n').filter(Boolean);
    for (var i = 0; i < lines.length; i++) console.error(WEB_PREFIX + ' ' + lines[i]);
  });
  webChild.on('close', function (code) {
    webChild = null;
    if (!shuttingDown) {
      console.log(WEB_PREFIX + ' Web client exited with code ' + code);
      shutdown(code || 1);
    }
  });

  // 4. Open browser after short delay
  setTimeout(function () { openBrowser('http://localhost:' + webPort); }, 2500);
}

process.on('SIGINT', function () { shutdown(0); });
process.on('SIGTERM', function () { shutdown(0); });

main();
`;
}

// =============================================================================
// Shell script templates
// =============================================================================

function generateStartSh(jsFile) {
  return `#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

mkdir -p data

if [ -x "$SCRIPT_DIR/node" ]; then
    NODE_CMD="$SCRIPT_DIR/node"
elif command -v node &>/dev/null; then
    NODE_CMD="node"
else
    echo "ERROR: Node.js not found!"
    exit 1
fi

"$NODE_CMD" ${jsFile}
`;
}

function generateStopSh(serviceName) {
  return `#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f "data/.pid" ]; then
    PID=$(cat data/.pid)
    echo "Stopping ${serviceName} (PID: $PID)..."
    kill -TERM "$PID" 2>/dev/null
    sleep 2
    kill -9 "$PID" 2>/dev/null
    rm -f data/.pid
    echo "Stopped."
else
    echo "No running instance found."
fi
`;
}

function generateInstallSh() {
  return `#!/bin/bash
# Sets executable permissions on scripts and the bundled Node.js binary.
# Run this once after extracting the archive:  chmod +x install.sh && ./install.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

chmod +x node *.sh 2>/dev/null
echo "Permissions set. Run ./start.sh (or ./start-server.sh / ./start-client.sh) to launch Budget App."
`;
}

// =============================================================================
// Distribution Packaging
// =============================================================================

/**
 * Step 5: Create distribution packages for a target platform
 */
async function createDistribution(platform) {
  const config = PLATFORM_CONFIG[platform];
  const suffix = config.archiveSuffix;
  const nodeBinary = config.nodeBinary;
  const nodeDir = path.join(DIST_DIR, `node-${platform}`);
  const nodeExeSrc = path.join(nodeDir, nodeBinary);

  logStep('5/6', `Creating ${platform} distribution packages...`);

  const serverDir = path.join(DISTRIBUTE_DIR, `BudgetApp-Server-${APP_VERSION}-${suffix}`);
  const clientDir = path.join(DISTRIBUTE_DIR, `BudgetApp-Client-${APP_VERSION}-${suffix}`);
  const fullDir = path.join(DISTRIBUTE_DIR, `BudgetApp-Full-${APP_VERSION}-${suffix}`);

  fs.mkdirSync(DISTRIBUTE_DIR, { recursive: true });

  // Clean specific package directories
  for (const dir of [serverDir, clientDir, fullDir]) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // --- SERVER PACKAGE ---
  log('  Packaging server...');
  fs.mkdirSync(serverDir, { recursive: true });

  if (fs.existsSync(nodeExeSrc)) {
    fs.copyFileSync(nodeExeSrc, path.join(serverDir, nodeBinary));
  }

  copyDir(
    path.join(STANDALONE_DIR, 'api-server'),
    path.join(serverDir, 'api-server')
  );

  const envExample = path.join(PROJECT_ROOT, '.env.example');
  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, path.join(serverDir, '.env.example'));
  }

  fs.writeFileSync(path.join(serverDir, 'start-server.js'), generateServerStartJs(), 'utf8');
  fs.writeFileSync(path.join(serverDir, 'start-server.sh'), generateStartSh('start-server.js'), 'utf8');
  fs.writeFileSync(path.join(serverDir, 'stop-server.sh'), generateStopSh('Budget App API Server'), 'utf8');
  fs.writeFileSync(path.join(serverDir, 'install.sh'), generateInstallSh(), 'utf8');

  logSuccess(`Server package: ${serverDir}`);

  // --- CLIENT PACKAGE ---
  log('  Packaging client...');
  fs.mkdirSync(clientDir, { recursive: true });

  if (fs.existsSync(nodeExeSrc)) {
    fs.copyFileSync(nodeExeSrc, path.join(clientDir, nodeBinary));
  }

  const nextFiles = ['server.js', 'package.json'];
  for (const f of nextFiles) {
    const src = path.join(STANDALONE_DIR, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(clientDir, f));
    }
  }

  const nextDirs = ['.next', 'node_modules', 'public'];
  for (const d of nextDirs) {
    const src = path.join(STANDALONE_DIR, d);
    if (fs.existsSync(src)) {
      copyDir(src, path.join(clientDir, d));
    }
  }

  // Remove .pnpm (already merged to top-level by fixPnpmLayout)
  const clientPnpmDir = path.join(clientDir, 'node_modules', '.pnpm');
  if (fs.existsSync(clientPnpmDir)) {
    log('  Removing .pnpm (already merged to top-level)...');
    fs.rmSync(clientPnpmDir, { recursive: true, force: true });
  }

  log('  Stripping unnecessary platform binaries...');
  stripUnnecessaryModules(path.join(clientDir, 'node_modules'), config.sharpKeep);

  fs.writeFileSync(path.join(clientDir, 'start-client.js'), generateClientStartJs(), 'utf8');
  fs.writeFileSync(path.join(clientDir, 'start-client.sh'), generateStartSh('start-client.js'), 'utf8');
  fs.writeFileSync(path.join(clientDir, 'stop-client.sh'), generateStopSh('Budget App Web Client'), 'utf8');
  fs.writeFileSync(path.join(clientDir, 'install.sh'), generateInstallSh(), 'utf8');

  logSuccess(`Client package: ${clientDir}`);

  // --- FULL (COMBINED) PACKAGE ---
  log('  Packaging full (server + client)...');
  fs.mkdirSync(fullDir, { recursive: true });

  if (fs.existsSync(nodeExeSrc)) {
    fs.copyFileSync(nodeExeSrc, path.join(fullDir, nodeBinary));
  }

  copyDir(
    path.join(STANDALONE_DIR, 'api-server'),
    path.join(fullDir, 'api-server')
  );

  for (const f of nextFiles) {
    const src = path.join(STANDALONE_DIR, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(fullDir, f));
    }
  }
  for (const d of nextDirs) {
    const src = path.join(STANDALONE_DIR, d);
    if (fs.existsSync(src)) {
      copyDir(src, path.join(fullDir, d));
    }
  }

  const fullPnpmDir = path.join(fullDir, 'node_modules', '.pnpm');
  if (fs.existsSync(fullPnpmDir)) {
    log('  Removing .pnpm (already merged to top-level)...');
    fs.rmSync(fullPnpmDir, { recursive: true, force: true });
  }

  log('  Stripping unnecessary platform binaries...');
  stripUnnecessaryModules(path.join(fullDir, 'node_modules'), config.sharpKeep);

  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, path.join(fullDir, '.env.example'));
  }

  fs.writeFileSync(path.join(fullDir, 'start.js'), generateFullStartJs(), 'utf8');
  fs.writeFileSync(path.join(fullDir, 'start.sh'), generateStartSh('start.js'), 'utf8');
  fs.writeFileSync(path.join(fullDir, 'stop.sh'), generateStopSh('Budget App'), 'utf8');
  fs.writeFileSync(path.join(fullDir, 'install.sh'), generateInstallSh(), 'utf8');

  logSuccess(`Full package: ${fullDir}`);

  // --- Summary ---
  log('');
  log(`${platform} distribution packages:`, colors.bright);

  const serverSize = getDirSize(serverDir);
  const clientSize = getDirSize(clientDir);
  const fullSize = getDirSize(fullDir);
  log(`  Server: ${(serverSize / 1024 / 1024).toFixed(1)} MB`);
  log(`  Client: ${(clientSize / 1024 / 1024).toFixed(1)} MB`);
  log(`  Full:   ${(fullSize / 1024 / 1024).toFixed(1)} MB`);
}

/**
 * Step 6: Create .tar.gz archives
 */
async function createArchives(platform) {
  const suffix = PLATFORM_CONFIG[platform].archiveSuffix;

  logStep('6/6', `Creating ${platform} archives...`);

  if (skipArchive) {
    logWarning('Skipping archive creation (--skip-archive flag)');
    return;
  }

  const packages = ['Server', 'Client', 'Full'];
  for (const pkg of packages) {
    const dirName = `BudgetApp-${pkg}-${APP_VERSION}-${suffix}`;
    const dirPath = path.join(DISTRIBUTE_DIR, dirName);
    const archivePath = path.join(DISTRIBUTE_DIR, `${dirName}.tar.gz`);

    if (fs.existsSync(dirPath)) {
      createTarGz(dirPath, archivePath);
      const archiveSize = fs.statSync(archivePath).size;
      logSuccess(`${pkg}: ${path.basename(archivePath)} (${(archiveSize / 1024 / 1024).toFixed(1)} MB)`);
    }
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  log('\n' + '='.repeat(50), colors.bright);
  log(`    Budget App Cross-Platform Build (v${APP_VERSION})`, colors.bright);
  log(`    Targets: ${targetPlatforms.join(', ')}`, colors.bright);
  log('='.repeat(50) + '\n', colors.bright);

  const startTime = Date.now();

  try {
    // Platform-agnostic build steps (only once)
    if (!skipBuild) {
      cleanDir(STANDALONE_DIR);
    }

    await buildNextJs();
    await bundleApiServer();
    await prepareStandalone();

    // Platform-specific steps (for each target)
    for (const platform of targetPlatforms) {
      log(`\n${'─'.repeat(50)}`, colors.cyan);
      log(`  Building for: ${platform}`, colors.cyan + colors.bright);
      log(`${'─'.repeat(50)}`, colors.cyan);

      await downloadNodeForPlatform(platform);
      await createDistribution(platform);
      await createArchives(platform);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);

    log('\n' + '='.repeat(50), colors.green + colors.bright);
    log('       Build Complete!', colors.green + colors.bright);
    log('='.repeat(50), colors.green + colors.bright);
    log(`\n  Time elapsed: ${elapsed} seconds\n`);

    log('Output files:', colors.bright);
    for (const platform of targetPlatforms) {
      const suffix = PLATFORM_CONFIG[platform].archiveSuffix;
      log(`\n  ${platform}:`);
      log(`    Server:  ${path.join(DISTRIBUTE_DIR, `BudgetApp-Server-${APP_VERSION}-${suffix}`)}`);
      log(`    Client:  ${path.join(DISTRIBUTE_DIR, `BudgetApp-Client-${APP_VERSION}-${suffix}`)}`);
      log(`    Full:    ${path.join(DISTRIBUTE_DIR, `BudgetApp-Full-${APP_VERSION}-${suffix}`)}`);

      if (!skipArchive) {
        const archivePath = path.join(DISTRIBUTE_DIR, `BudgetApp-Full-${APP_VERSION}-${suffix}.tar.gz`);
        if (fs.existsSync(archivePath)) {
          log(`    Archive: ${archivePath}`, colors.green);
        }
      }
    }

    log('\nTo use on the target system:', colors.bright);
    log('  1. Copy/extract the package to the target machine');
    log('  2. Run: chmod +x install.sh && ./install.sh');
    log('  3. Run: ./start.sh');
    log('  4. Open http://localhost:3400\n');

  } catch (error) {
    logError(`Build failed: ${error.message}`);
    process.exit(1);
  }
}

main();
