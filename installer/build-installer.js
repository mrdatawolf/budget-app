/**
 * Budget App Installer Build Script (v2.0.0)
 *
 * Builds both the Next.js client and Hono API server for standalone distribution.
 *
 * Steps:
 * 1. Build Next.js in standalone mode
 * 2. Bundle API server with esbuild (single file, PGlite external)
 * 3. Download Node.js portable runtime (cached)
 * 4. Prepare standalone directory (Next.js + API server + startup scripts)
 * 5. Verify the build
 * 6. Run Inno Setup to create Windows installer (optional)
 *
 * Usage:
 *   node installer/build-installer.js [--skip-build] [--skip-inno]
 *
 * Prerequisites:
 *   - Node.js 20+ and pnpm (for building)
 *   - Inno Setup 6+ (for creating installer, optional)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// Configuration
const APP_VERSION = '2.0.0';
const NODE_VERSION = '20.11.1'; // LTS version
const NODE_DOWNLOAD_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const STANDALONE_DIR = path.join(DIST_DIR, 'standalone');
const NODE_CACHE_DIR = path.join(DIST_DIR, 'node-cache');
const NODE_DIR = path.join(DIST_DIR, 'node');

// Parse command line arguments
const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const skipInno = args.includes('--skip-inno');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n[${step}] ${message}`, colors.cyan + colors.bright);
}

function logSuccess(message) {
  log(`  ✓ ${message}`, colors.green);
}

function logWarning(message) {
  log(`  ! ${message}`, colors.yellow);
}

function logError(message) {
  log(`  ✗ ${message}`, colors.red);
}

/**
 * Download a file from URL to destination
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    const request = https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      const totalBytes = parseInt(response.headers['content-length'], 10);
      let downloadedBytes = 0;

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const percent = totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
        process.stdout.write(`\r  Downloading: ${percent}% (${Math.round(downloadedBytes / 1024 / 1024)}MB)`);
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(''); // New line after progress
        resolve();
      });
    });

    request.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

/**
 * Extract zip file (Windows-specific using PowerShell)
 */
function extractZip(zipPath, destDir) {
  log(`  Extracting to ${destDir}...`);
  execSync(
    `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
    { stdio: 'inherit' }
  );
}

/**
 * Copy directory recursively (handles pnpm symlinks)
 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    try {
      // Resolve symlinks to get the real path
      const realPath = fs.realpathSync(srcPath);
      const stat = fs.statSync(realPath);

      if (stat.isDirectory()) {
        copyDir(realPath, destPath);
      } else {
        fs.copyFileSync(realPath, destPath);
      }
    } catch (err) {
      // Skip files that can't be copied (broken symlinks, permission issues)
      // This is expected for platform-specific binaries (e.g., darwin on Windows)
      if (err.code === 'EPERM' || err.code === 'ENOENT') {
        continue;
      }
      throw err;
    }
  }
}

/**
 * Clean directory
 */
function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Step 1: Build Next.js in standalone mode
 */
async function buildNextJs() {
  logStep('1/6', 'Building Next.js application...');

  if (skipBuild) {
    logWarning('Skipping build (--skip-build flag)');
    return;
  }

  // Clean previous build
  const nextDir = path.join(PROJECT_ROOT, '.next');
  if (fs.existsSync(nextDir)) {
    log('  Cleaning previous build...');
    fs.rmSync(nextDir, { recursive: true, force: true });
  }

  // Run Next.js build
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
 * Step 3: Download Node.js portable runtime
 */
async function downloadNodeJs() {
  logStep('3/6', 'Preparing Node.js runtime...');

  const nodeExePath = path.join(NODE_DIR, 'node.exe');
  const cacheZipPath = path.join(NODE_CACHE_DIR, `node-v${NODE_VERSION}-win-x64.zip`);

  // Check if already cached
  if (fs.existsSync(nodeExePath)) {
    logSuccess(`Node.js ${NODE_VERSION} already available`);
    return;
  }

  fs.mkdirSync(NODE_CACHE_DIR, { recursive: true });
  fs.mkdirSync(NODE_DIR, { recursive: true });

  // Download if not cached
  if (!fs.existsSync(cacheZipPath)) {
    log(`  Downloading Node.js ${NODE_VERSION}...`);
    await downloadFile(NODE_DOWNLOAD_URL, cacheZipPath);
    logSuccess('Download complete');
  } else {
    logSuccess('Using cached Node.js download');
  }

  // Extract
  const tempExtractDir = path.join(DIST_DIR, 'node-extract');
  cleanDir(tempExtractDir);
  extractZip(cacheZipPath, tempExtractDir);

  // Find the extracted folder and copy node.exe
  const extractedFolder = fs.readdirSync(tempExtractDir)[0];
  const extractedNodeExe = path.join(tempExtractDir, extractedFolder, 'node.exe');

  if (fs.existsSync(extractedNodeExe)) {
    fs.copyFileSync(extractedNodeExe, nodeExePath);
    logSuccess(`Node.js ${NODE_VERSION} extracted`);
  } else {
    throw new Error('Could not find node.exe in extracted archive');
  }

  // Cleanup
  fs.rmSync(tempExtractDir, { recursive: true, force: true });
}

/**
 * Fix pnpm's split node_modules layout.
 *
 * pnpm stores actual package files in .pnpm/<pkg>@<version>/node_modules/<pkg>/
 * and creates symlinks/junctions at the top level. Next.js standalone tracing
 * copies the .pnpm structure but top-level entries may be incomplete (only
 * package.json without actual code files). This function merges files from
 * .pnpm/ into the top-level entries so the app works without pnpm resolution.
 */
function fixPnpmLayout(nodeModulesDir) {
  const pnpmDir = path.join(nodeModulesDir, '.pnpm');
  if (!fs.existsSync(pnpmDir)) return;

  const pnpmEntries = fs.readdirSync(pnpmDir, { withFileTypes: true });
  let fixed = 0;

  for (const entry of pnpmEntries) {
    if (!entry.isDirectory()) continue;

    // Each .pnpm entry has a node_modules/ subdirectory with the actual packages
    const innerModules = path.join(pnpmDir, entry.name, 'node_modules');
    if (!fs.existsSync(innerModules)) continue;

    // Iterate packages inside (may be scoped like @swc/helpers)
    const pkgEntries = fs.readdirSync(innerModules, { withFileTypes: true });
    for (const pkgEntry of pkgEntries) {
      if (!pkgEntry.isDirectory()) continue;

      let pkgName = pkgEntry.name;
      let srcPkgDir = path.join(innerModules, pkgName);

      // Handle scoped packages (@scope/name)
      if (pkgName.startsWith('@')) {
        const scopeEntries = fs.readdirSync(srcPkgDir, { withFileTypes: true });
        for (const scopeEntry of scopeEntries) {
          if (!scopeEntry.isDirectory()) continue;
          const scopedName = `${pkgName}/${scopeEntry.name}`;
          const scopedSrc = path.join(srcPkgDir, scopeEntry.name);
          const scopedDest = path.join(nodeModulesDir, pkgName, scopeEntry.name);

          if (mergePackageDir(scopedSrc, scopedDest)) {
            fixed++;
          }
        }
      } else {
        const destPkgDir = path.join(nodeModulesDir, pkgName);
        if (mergePackageDir(srcPkgDir, destPkgDir)) {
          fixed++;
        }
      }
    }
  }

  if (fixed > 0) {
    logSuccess(`Fixed ${fixed} incomplete package(s) from .pnpm`);
  }
}

/**
 * Merge files from src into dest, only copying files that don't exist in dest.
 * Returns true if any files were added.
 */
function mergePackageDir(src, dest) {
  if (!fs.existsSync(src)) return false;

  // If dest doesn't exist at all, just copy the whole thing
  if (!fs.existsSync(dest)) {
    try {
      copyDir(src, dest);
      return true;
    } catch {
      return false;
    }
  }

  let added = false;
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    try {
      if (!fs.existsSync(destPath)) {
        const realPath = fs.realpathSync(srcPath);
        const stat = fs.statSync(realPath);

        if (stat.isDirectory()) {
          copyDir(realPath, destPath);
        } else {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(realPath, destPath);
        }
        added = true;
      } else if (entry.isDirectory()) {
        // Recurse into existing subdirectories to merge deeper
        if (mergePackageDir(srcPath, destPath)) {
          added = true;
        }
      }
    } catch {
      // Skip files that can't be copied
      continue;
    }
  }

  return added;
}

/**
 * Step 4: Prepare standalone directory
 */
async function prepareStandalone() {
  logStep('4/6', 'Preparing standalone package...');

  // Source paths from Next.js build
  const nextStandalone = path.join(PROJECT_ROOT, '.next', 'standalone');
  const nextStatic = path.join(PROJECT_ROOT, '.next', 'static');
  const publicDir = path.join(PROJECT_ROOT, 'public');

  // Check if standalone build exists
  if (!fs.existsSync(nextStandalone)) {
    throw new Error(
      'Next.js standalone build not found. Make sure next.config.ts has output: "standalone"'
    );
  }

  // Copy Next.js standalone output into STANDALONE_DIR (preserves api-server/ from step 2)
  log('  Copying standalone server files...');
  const standaloneEntries = fs.readdirSync(nextStandalone, { withFileTypes: true });
  for (const entry of standaloneEntries) {
    const srcPath = path.join(nextStandalone, entry.name);
    const destPath = path.join(STANDALONE_DIR, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  // Copy static files to .next/static
  const destStatic = path.join(STANDALONE_DIR, '.next', 'static');
  if (fs.existsSync(nextStatic)) {
    log('  Copying static assets...');
    copyDir(nextStatic, destStatic);
  }

  // Copy public folder
  const destPublic = path.join(STANDALONE_DIR, 'public');
  if (fs.existsSync(publicDir)) {
    log('  Copying public assets...');
    copyDir(publicDir, destPublic);
  }

  // Fix pnpm's split node_modules layout
  log('  Fixing pnpm module layout...');
  fixPnpmLayout(path.join(STANDALONE_DIR, 'node_modules'));

  // Copy start-production.js
  log('  Copying startup script...');
  fs.copyFileSync(
    path.join(__dirname, 'start-production.js'),
    path.join(STANDALONE_DIR, 'start-production.js')
  );

  // Copy .env.example as reference
  const envExample = path.join(PROJECT_ROOT, '.env.example');
  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, path.join(STANDALONE_DIR, '.env.example'));
  }

  logSuccess('Standalone package prepared');
}

/**
 * Step 5: Verify the build
 */
async function verifyBuild() {
  logStep('5/6', 'Verifying build...');

  const checks = [
    { path: path.join(STANDALONE_DIR, 'server.js'), name: 'Next.js server' },
    { path: path.join(STANDALONE_DIR, 'api-server', 'index.mjs'), name: 'API server bundle' },
    { path: path.join(STANDALONE_DIR, 'api-server', 'node_modules', '@electric-sql', 'pglite', 'package.json'), name: 'PGlite runtime' },
    { path: path.join(STANDALONE_DIR, 'start-production.js'), name: 'Startup script' },
    { path: path.join(NODE_DIR, 'node.exe'), name: 'Node.js runtime' },
  ];

  let allGood = true;
  for (const check of checks) {
    if (fs.existsSync(check.path)) {
      logSuccess(check.name);
    } else {
      logError(`${check.name} — MISSING at ${check.path}`);
      allGood = false;
    }
  }

  if (!allGood) {
    throw new Error('Build verification failed. Some files are missing.');
  }

  // Report sizes
  const apiBundle = path.join(STANDALONE_DIR, 'api-server', 'index.mjs');
  const apiSize = fs.statSync(apiBundle).size;
  log(`  API bundle size: ${(apiSize / 1024 / 1024).toFixed(1)} MB`);
}

/**
 * Step 6: Run Inno Setup compiler
 */
async function runInnoSetup() {
  logStep('6/6', 'Creating Windows installer...');

  if (skipInno) {
    logWarning('Skipping Inno Setup (--skip-inno flag)');
    log('  To create installer manually, run Inno Setup on: installer/budget-app.iss');
    return;
  }

  // Find Inno Setup compiler
  const innoPaths = [
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files (x86)\\Inno Setup 5\\ISCC.exe',
  ];

  let innoCompiler = null;
  for (const p of innoPaths) {
    if (fs.existsSync(p)) {
      innoCompiler = p;
      break;
    }
  }

  if (!innoCompiler) {
    logWarning('Inno Setup not found. Please install from: https://jrsoftware.org/isinfo.php');
    log('  After installing, run this script again or compile installer/budget-app.iss manually');
    return;
  }

  log(`  Found Inno Setup: ${innoCompiler}`);

  // Copy icon if it exists
  const iconSrc = path.join(PROJECT_ROOT, 'public', 'icon.ico');
  const iconDest = path.join(STANDALONE_DIR, 'icon.ico');
  if (fs.existsSync(iconSrc)) {
    fs.copyFileSync(iconSrc, iconDest);
  } else {
    logWarning('No icon.ico found in public/ — installer will use default icon');
  }

  // Run Inno Setup compiler
  const issPath = path.join(__dirname, 'budget-app.iss');
  log('  Compiling installer...');

  try {
    execSync(`"${innoCompiler}" "${issPath}"`, {
      cwd: __dirname,
      stdio: 'inherit',
    });

    const installerPath = path.join(DIST_DIR, `BudgetApp-${APP_VERSION}-Setup.exe`);
    if (fs.existsSync(installerPath)) {
      logSuccess(`Installer created: ${installerPath}`);
    }
  } catch (error) {
    logError('Inno Setup compilation failed');
    throw error;
  }
}

/**
 * Main build process
 */
async function main() {
  log('\n' + '='.repeat(50), colors.bright);
  log(`    Budget App Installer Build (v${APP_VERSION})`, colors.bright);
  log('='.repeat(50) + '\n', colors.bright);

  const startTime = Date.now();

  try {
    // Clean standalone dir (but not node cache)
    if (!skipBuild) {
      cleanDir(STANDALONE_DIR);
    }

    await buildNextJs();
    await bundleApiServer();
    await downloadNodeJs();
    await prepareStandalone();
    await verifyBuild();
    await runInnoSetup();

    const elapsed = Math.round((Date.now() - startTime) / 1000);

    log('\n' + '='.repeat(50), colors.green + colors.bright);
    log('       Build Complete!', colors.green + colors.bright);
    log('='.repeat(50), colors.green + colors.bright);
    log(`\n  Time elapsed: ${elapsed} seconds\n`);

    log('Output files:', colors.bright);
    log(`  Standalone:  ${STANDALONE_DIR}`);
    log(`  Node.js:     ${path.join(NODE_DIR, 'node.exe')}`);

    const installer = path.join(DIST_DIR, `BudgetApp-${APP_VERSION}-Setup.exe`);
    if (fs.existsSync(installer)) {
      log(`  Installer:   ${installer}`, colors.green);
    }

    log('\nTo test locally:', colors.bright);
    log('  1. cd dist/standalone');
    log('  2. ..\\node\\node.exe start-production.js');
    log('  3. Open http://localhost:3400\n');

  } catch (error) {
    logError(`Build failed: ${error.message}`);
    process.exit(1);
  }
}

main();
