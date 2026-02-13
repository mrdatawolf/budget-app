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
  generateServerStartJs, generateClientStartJs, generateFullStartJs,
  generateStartSh, generateStopSh, generateInstallSh,
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
