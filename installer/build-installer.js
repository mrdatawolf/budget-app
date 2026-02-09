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

// Configuration — version read from package.json
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;
const NODE_VERSION = '20.11.1'; // LTS version
const NODE_DOWNLOAD_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const STANDALONE_DIR = path.join(DIST_DIR, 'standalone');
const NODE_CACHE_DIR = path.join(DIST_DIR, 'node-cache');
const NODE_DIR = path.join(DIST_DIR, 'node');
const DISTRIBUTE_DIR = path.join(PROJECT_ROOT, 'distribute');

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
 * Detect the Next.js standalone project directory.
 *
 * Next.js 16+ nests standalone output under a project-name subdirectory
 * (e.g., .next/standalone/budget-app/server.js). Earlier versions put
 * server.js directly in .next/standalone/. This function detects which
 * layout we have and returns the correct source directory.
 */
function findStandaloneRoot(standaloneDir) {
  // Check if server.js is directly in the standalone dir (Next.js <16)
  if (fs.existsSync(path.join(standaloneDir, 'server.js'))) {
    return standaloneDir;
  }

  // Next.js 16+: look for a project subdirectory containing server.js
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

  // Find the actual project root within standalone output
  // Next.js 16+ nests under a project-name subdirectory
  const standaloneRoot = findStandaloneRoot(nextStandalone);

  // Copy Next.js standalone output into STANDALONE_DIR (preserves api-server/ from step 2)
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
 * Find NSIS makensis.exe compiler
 */
function findMakeNsis() {
  const locations = [
    'C:\\Program Files (x86)\\NSIS\\makensis.exe',
    'C:\\Program Files\\NSIS\\makensis.exe',
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) return loc;
  }

  // Try PATH
  try {
    const result = execSync('where makensis', { encoding: 'utf8' }).trim().split('\n')[0];
    if (result && fs.existsSync(result)) return result;
  } catch { /* not in PATH */ }

  return null;
}

/**
 * Build an NSIS installer from a source directory.
 *
 * @param {Object} opts
 * @param {string} opts.name          - Display name (e.g., "Budget App Server")
 * @param {string} opts.sourceDir     - Directory containing files to package
 * @param {string} opts.outputExe     - Output .exe filename (no path)
 * @param {string} opts.installDir    - Default install directory
 * @param {string} opts.regKey        - Registry key for storing install path
 * @param {string} opts.shortcutName  - Start Menu / Desktop shortcut name
 * @param {string} opts.launchFile    - File to launch from shortcuts (relative to install dir)
 * @param {string} opts.iconFile      - Icon .ico path (optional)
 * @param {string[]} opts.dataDirs    - Directories to preserve on uninstall (relative names)
 */
function buildNsisInstaller(makensisPath, opts) {
  const tempDir = path.join(DIST_DIR, 'nsis-temp');
  cleanDir(tempDir);

  // Copy source files to temp
  copyDir(opts.sourceDir, path.join(tempDir, 'files'));

  // Icon handling
  let iconDirective = '';
  let unIconDirective = '';
  if (opts.iconFile && fs.existsSync(opts.iconFile)) {
    const iconDest = path.join(tempDir, 'icon.ico');
    fs.copyFileSync(opts.iconFile, iconDest);
    iconDirective = `!define MUI_ICON "${iconDest.replace(/\\/g, '\\\\')}"`;
    unIconDirective = `!define MUI_UNICON "${iconDest.replace(/\\/g, '\\\\')}"`;
  }

  // Data directory preservation script
  const dataDirChecks = (opts.dataDirs || []).map(d =>
    `  RMDir /r "$INSTDIR\\${d}"`
  ).join('\n');

  // Generate uninstall sections that skip data dirs
  const uninstallRemove = (opts.dataDirs && opts.dataDirs.length > 0)
    ? `  ; Ask user about data preservation
  MessageBox MB_YESNO "Do you want to keep your budget data?$\\r$\\n$\\r$\\nClick Yes to keep your data (you can use it if you reinstall).$\\r$\\nClick No to delete all data." IDYES SkipDataDelete
${dataDirChecks}
  SkipDataDelete:`
    : '';

  const nsisScript = `
; NSIS Installer Script for ${opts.name}
; Generated by build-installer.js

!include "MUI2.nsh"

; General
Name "${opts.name} ${APP_VERSION}"
OutFile "${path.join(DISTRIBUTE_DIR, opts.outputExe).replace(/\\/g, '\\\\')}"
InstallDir "${opts.installDir}"
InstallDirRegKey HKCU "Software\\${opts.regKey}" "InstallDir"
RequestExecutionLevel user

; Interface Settings
!define MUI_ABORTWARNING
${iconDirective}
${unIconDirective}

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Languages
!insertmacro MUI_LANGUAGE "English"

; Installer Section
Section "Install"
  SetOutPath "$INSTDIR"

  ; Copy all files
  File /r "${path.join(tempDir, 'files', '*.*').replace(/\\/g, '\\\\')}"

  ; Store installation folder
  WriteRegStr HKCU "Software\\${opts.regKey}" "InstallDir" "$INSTDIR"

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\\Uninstall.exe"

  ; Create Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\\${opts.shortcutName}"
  CreateShortcut "$SMPROGRAMS\\${opts.shortcutName}\\${opts.shortcutName}.lnk" "$INSTDIR\\${opts.launchFile}" "" "$INSTDIR\\node.exe"
  CreateShortcut "$SMPROGRAMS\\${opts.shortcutName}\\Uninstall.lnk" "$INSTDIR\\Uninstall.exe"

  ; Create Desktop shortcut
  CreateShortcut "$DESKTOP\\${opts.shortcutName}.lnk" "$INSTDIR\\${opts.launchFile}" "" "$INSTDIR\\node.exe"

SectionEnd

; Uninstaller Section
Section "Uninstall"
${uninstallRemove}

  ; Remove all files
  RMDir /r "$INSTDIR"

  ; Remove shortcuts
  Delete "$SMPROGRAMS\\${opts.shortcutName}\\${opts.shortcutName}.lnk"
  Delete "$SMPROGRAMS\\${opts.shortcutName}\\Uninstall.lnk"
  RMDir "$SMPROGRAMS\\${opts.shortcutName}"
  Delete "$DESKTOP\\${opts.shortcutName}.lnk"

  ; Remove registry keys
  DeleteRegKey HKCU "Software\\${opts.regKey}"

SectionEnd
`;

  const nsisScriptPath = path.join(tempDir, 'installer.nsi');
  fs.writeFileSync(nsisScriptPath, nsisScript, 'utf8');

  // Compile
  execSync(`"${makensisPath}" "${nsisScriptPath}"`, { stdio: 'inherit' });

  // Cleanup temp
  fs.rmSync(tempDir, { recursive: true, force: true });
}

/**
 * Step 6: Create NSIS installers for server and client
 */
async function createInstallers() {
  logStep('7/7', 'Creating Windows installers...');

  if (skipInno) {
    logWarning('Skipping installer creation (--skip-inno flag)');
    return;
  }

  const makensisPath = findMakeNsis();
  if (!makensisPath) {
    logWarning('NSIS not found. Install from: https://nsis.sourceforge.io/Download');
    log('  Or run: winget install NSIS.NSIS');
    log('  Distribution packages are still available in distribute/');
    return;
  }

  log(`  Found NSIS: ${makensisPath}`);

  const iconFile = path.join(PROJECT_ROOT, 'public', 'icon.ico');
  const serverDir = path.join(DISTRIBUTE_DIR, `BudgetApp-Server-${APP_VERSION}`);
  const clientDir = path.join(DISTRIBUTE_DIR, `BudgetApp-Client-${APP_VERSION}`);

  // --- Server Installer ---
  log('  Building server installer...');
  buildNsisInstaller(makensisPath, {
    name: 'Budget App Server',
    sourceDir: serverDir,
    outputExe: `BudgetApp-Server-${APP_VERSION}-Setup.exe`,
    installDir: 'C:\\BudgetAppServer',
    regKey: 'BudgetAppServer',
    shortcutName: 'Budget App Server',
    launchFile: 'start-server.bat',
    iconFile,
    dataDirs: ['data'],
  });
  logSuccess(`Server installer: BudgetApp-Server-${APP_VERSION}-Setup.exe`);

  // --- Client Installer ---
  log('  Building client installer...');
  buildNsisInstaller(makensisPath, {
    name: 'Budget App Client',
    sourceDir: clientDir,
    outputExe: `BudgetApp-Client-${APP_VERSION}-Setup.exe`,
    installDir: 'C:\\BudgetAppClient',
    regKey: 'BudgetAppClient',
    shortcutName: 'Budget App',
    launchFile: 'start-client.bat',
    iconFile,
    dataDirs: [],
  });
  logSuccess(`Client installer: BudgetApp-Client-${APP_VERSION}-Setup.exe`);
}

/**
 * Step 7: Create separate distribution packages
 *
 * Produces:
 *   distribute/
 *     BudgetApp-Server-2.0.0/    — API server + Node.js + PGlite (self-contained)
 *     BudgetApp-Client-2.0.0/    — Next.js web app + Node.js (self-contained)
 */
async function createDistribution() {
  logStep('6/7', 'Creating distribution packages...');

  const serverDir = path.join(DISTRIBUTE_DIR, `BudgetApp-Server-${APP_VERSION}`);
  const clientDir = path.join(DISTRIBUTE_DIR, `BudgetApp-Client-${APP_VERSION}`);

  // Ensure distribute directory exists (never clean it — preserves previous installers)
  fs.mkdirSync(DISTRIBUTE_DIR, { recursive: true });

  // Only clean the specific package subdirectories that will be rebuilt
  if (fs.existsSync(serverDir)) {
    fs.rmSync(serverDir, { recursive: true, force: true });
  }
  if (fs.existsSync(clientDir)) {
    fs.rmSync(clientDir, { recursive: true, force: true });
  }

  // --- SERVER PACKAGE ---
  log('  Packaging server...');
  fs.mkdirSync(serverDir, { recursive: true });

  // Copy Node.js runtime
  const nodeExeSrc = path.join(NODE_DIR, 'node.exe');
  if (fs.existsSync(nodeExeSrc)) {
    fs.copyFileSync(nodeExeSrc, path.join(serverDir, 'node.exe'));
  }

  // Copy API server bundle
  copyDir(
    path.join(STANDALONE_DIR, 'api-server'),
    path.join(serverDir, 'api-server')
  );

  // Copy .env.example
  const envExample = path.join(PROJECT_ROOT, '.env.example');
  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, path.join(serverDir, '.env.example'));
  }

  // Create server startup script (Node.js)
  fs.writeFileSync(path.join(serverDir, 'start-server.js'), `#!/usr/bin/env node
/**
 * Budget App API Server — Standalone Startup
 * Starts the Hono API server with PGlite local database.
 */
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const APP_DIR = __dirname;
const DEFAULT_API_PORT = 3401;

function readEnvVar(name, defaultValue) {
  const envPath = path.join(APP_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(new RegExp(\`^\${name}=(.+)\`, 'm'));
    if (match) return match[1].trim();
  }
  if (process.env[name]) return process.env[name];
  return defaultValue;
}

function writePidFile() {
  const dataDir = path.join(APP_DIR, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, '.pid'), process.pid.toString(), 'utf8');
}

function removePidFile() {
  try { fs.unlinkSync(path.join(APP_DIR, 'data', '.pid')); } catch {}
}

async function main() {
  const apiPort = parseInt(readEnvVar('API_PORT', String(DEFAULT_API_PORT)), 10);

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

  const dataDir = path.join(APP_DIR, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  writePidFile();

  const serverEntry = path.join(APP_DIR, 'api-server', 'index.mjs');
  if (!fs.existsSync(serverEntry)) {
    console.error('API server not found at ' + serverEntry);
    process.exit(1);
  }

  const child = spawn(process.execPath, [serverEntry], {
    cwd: path.join(APP_DIR, 'api-server'),
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      API_PORT: apiPort.toString(),
      PGLITE_DB_LOCATION: path.join(APP_DIR, 'data', 'budget-local'),
    },
  });

  child.on('close', (code) => {
    removePidFile();
    process.exit(code || 0);
  });

  process.on('SIGINT', () => {
    try { spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'], { stdio: 'ignore' }); } catch {}
    removePidFile();
    setTimeout(() => process.exit(0), 1000);
  });
  process.on('SIGTERM', () => {
    try { spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'], { stdio: 'ignore' }); } catch {}
    removePidFile();
    setTimeout(() => process.exit(0), 1000);
  });
}

main();
`, 'utf8');

  // Create server batch file
  fs.writeFileSync(path.join(serverDir, 'start-server.bat'), `@echo off
setlocal enabledelayedexpansion
title Budget App API Server

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

if not exist "data" mkdir data

if exist "node.exe" (
    set "NODE_CMD=%SCRIPT_DIR%node.exe"
) else (
    where node >nul 2>nul
    if errorlevel 1 (
        echo ERROR: Node.js not found!
        pause
        exit /b 1
    )
    set "NODE_CMD=node"
)

"%NODE_CMD%" start-server.js

echo.
echo Server stopped.
pause
`, 'utf8');

  // Create stop batch file for server
  fs.writeFileSync(path.join(serverDir, 'stop-server.bat'), `@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

if exist "data\\.pid" (
    set /p PID=<"data\\.pid"
    echo Stopping Budget App API Server (PID: %PID%)...
    taskkill /pid %PID% /f /t >nul 2>nul
    del "data\\.pid" >nul 2>nul
    echo Stopped.
) else (
    echo No running server found.
)
pause
`, 'utf8');

  logSuccess(`Server package: ${serverDir}`);

  // --- CLIENT PACKAGE ---
  log('  Packaging client...');
  fs.mkdirSync(clientDir, { recursive: true });

  // Copy Node.js runtime
  if (fs.existsSync(nodeExeSrc)) {
    fs.copyFileSync(nodeExeSrc, path.join(clientDir, 'node.exe'));
  }

  // Copy Next.js standalone files (server.js, .next/, node_modules/, package.json)
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

  // Remove .pnpm directory from client package.
  // fixPnpmLayout() already merged needed files to top-level node_modules,
  // and the deeply nested .pnpm paths exceed Windows MAX_PATH / NSIS limits.
  const clientPnpmDir = path.join(clientDir, 'node_modules', '.pnpm');
  if (fs.existsSync(clientPnpmDir)) {
    log('  Removing .pnpm (already merged to top-level)...');
    fs.rmSync(clientPnpmDir, { recursive: true, force: true });
  }

  // Create client startup script (Node.js)
  fs.writeFileSync(path.join(clientDir, 'start-client.js'), `#!/usr/bin/env node
/**
 * Budget App Web Client — Standalone Startup
 * Starts the Next.js web server.
 */
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const APP_DIR = __dirname;
const DEFAULT_WEB_PORT = 3400;
const DEFAULT_API_PORT = 3401;

function readEnvVar(name, defaultValue) {
  const envPath = path.join(APP_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(new RegExp(\`^\${name}=(.+)\`, 'm'));
    if (match) return match[1].trim();
  }
  if (process.env[name]) return process.env[name];
  return defaultValue;
}

function writePidFile() {
  const dataDir = path.join(APP_DIR, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, '.pid'), process.pid.toString(), 'utf8');
}

function removePidFile() {
  try { fs.unlinkSync(path.join(APP_DIR, 'data', '.pid')); } catch {}
}

function openBrowser(url) {
  try { execSync('start "" "' + url + '"', { stdio: 'ignore', shell: true }); }
  catch { console.log('Open your browser to: ' + url); }
}

async function main() {
  const webPort = parseInt(readEnvVar('SERVER_PORT', String(DEFAULT_WEB_PORT)), 10);
  const apiPort = parseInt(readEnvVar('API_PORT', String(DEFAULT_API_PORT)), 10);

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

  const serverEntry = path.join(APP_DIR, 'server.js');
  if (!fs.existsSync(serverEntry)) {
    console.error('Next.js server not found at ' + serverEntry);
    process.exit(1);
  }

  writePidFile();

  const child = spawn(process.execPath, [serverEntry], {
    cwd: APP_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: webPort.toString(),
      HOSTNAME: '0.0.0.0',
    },
  });

  setTimeout(() => openBrowser('http://localhost:' + webPort), 2000);

  child.on('close', (code) => {
    removePidFile();
    process.exit(code || 0);
  });

  process.on('SIGINT', () => {
    try { spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'], { stdio: 'ignore' }); } catch {}
    removePidFile();
    setTimeout(() => process.exit(0), 1000);
  });
  process.on('SIGTERM', () => {
    try { spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'], { stdio: 'ignore' }); } catch {}
    removePidFile();
    setTimeout(() => process.exit(0), 1000);
  });
}

main();
`, 'utf8');

  // Create client batch file
  fs.writeFileSync(path.join(clientDir, 'start-client.bat'), `@echo off
setlocal enabledelayedexpansion
title Budget App Web Client

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

if exist "node.exe" (
    set "NODE_CMD=%SCRIPT_DIR%node.exe"
) else (
    where node >nul 2>nul
    if errorlevel 1 (
        echo ERROR: Node.js not found!
        pause
        exit /b 1
    )
    set "NODE_CMD=node"
)

"%NODE_CMD%" start-client.js

echo.
echo Client stopped.
pause
`, 'utf8');

  // Create stop batch file for client
  fs.writeFileSync(path.join(clientDir, 'stop-client.bat'), `@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

if exist "data\\.pid" (
    set /p PID=<"data\\.pid"
    echo Stopping Budget App Web Client (PID: %PID%)...
    taskkill /pid %PID% /f /t >nul 2>nul
    del "data\\.pid" >nul 2>nul
    echo Stopped.
) else (
    echo No running client found.
)
pause
`, 'utf8');

  logSuccess(`Client package: ${clientDir}`);

  // --- Summary ---
  log('');
  log('Distribution packages:', colors.bright);

  const serverSize = getDirSize(serverDir);
  const clientSize = getDirSize(clientDir);
  log(`  Server: ${(serverSize / 1024 / 1024).toFixed(1)} MB — ${serverDir}`);
  log(`  Client: ${(clientSize / 1024 / 1024).toFixed(1)} MB — ${clientDir}`);

  log('');
  log('To test:', colors.bright);
  log('  1. Start server:  cd distribute\\BudgetApp-Server-' + APP_VERSION + ' && start-server.bat');
  log('  2. Start client:  cd distribute\\BudgetApp-Client-' + APP_VERSION + ' && start-client.bat');
  log('  3. Open http://localhost:3400');
}

/**
 * Calculate total size of a directory recursively.
 */
function getDirSize(dirPath) {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          total += getDirSize(fullPath);
        } else {
          total += fs.statSync(fullPath).size;
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return total;
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
    await createDistribution();
    await createInstallers();

    const elapsed = Math.round((Date.now() - startTime) / 1000);

    log('\n' + '='.repeat(50), colors.green + colors.bright);
    log('       Build Complete!', colors.green + colors.bright);
    log('='.repeat(50), colors.green + colors.bright);
    log(`\n  Time elapsed: ${elapsed} seconds\n`);

    log('Output files:', colors.bright);
    log(`  Standalone:  ${STANDALONE_DIR}`);
    log(`  Server pkg:  ${path.join(DISTRIBUTE_DIR, `BudgetApp-Server-${APP_VERSION}`)}`);
    log(`  Client pkg:  ${path.join(DISTRIBUTE_DIR, `BudgetApp-Client-${APP_VERSION}`)}`);

    const serverInstaller = path.join(DISTRIBUTE_DIR, `BudgetApp-Server-${APP_VERSION}-Setup.exe`);
    const clientInstaller = path.join(DISTRIBUTE_DIR, `BudgetApp-Client-${APP_VERSION}-Setup.exe`);
    if (fs.existsSync(serverInstaller)) {
      log(`  Server .exe: ${serverInstaller}`, colors.green);
    }
    if (fs.existsSync(clientInstaller)) {
      log(`  Client .exe: ${clientInstaller}`, colors.green);
    }

    log('\nTo test locally:', colors.bright);
    log('  1. Start server:  cd distribute\\BudgetApp-Server-' + APP_VERSION + ' && start-server.bat');
    log('  2. Start client:  cd distribute\\BudgetApp-Client-' + APP_VERSION + ' && start-client.bat');
    log('  3. Open http://localhost:3400\n');

  } catch (error) {
    logError(`Build failed: ${error.message}`);
    process.exit(1);
  }
}

main();
