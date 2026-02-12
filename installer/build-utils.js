/**
 * Shared build utilities for Budget App installer scripts.
 * Used by build-installer.js and build-cross-platform.js.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '..');
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')).version;
const NODE_VERSION = '20.11.1'; // LTS version
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const STANDALONE_DIR = path.join(DIST_DIR, 'standalone');
const NODE_CACHE_DIR = path.join(DIST_DIR, 'node-cache');
const DISTRIBUTE_DIR = path.join(PROJECT_ROOT, 'distribute');

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
 * Extract tarball (.tar.gz) file.
 * Uses system tar which is available on Windows 10+, Linux, and macOS.
 */
function extractTarball(tarPath, destDir) {
  log(`  Extracting to ${destDir}...`);
  fs.mkdirSync(destDir, { recursive: true });
  execSync(`tar xzf "${tarPath}" -C "${destDir}"`, { stdio: 'inherit' });
}

/**
 * Create a .tar.gz archive from a directory.
 * Uses system tar which is available on Windows 10+, Linux, and macOS.
 */
function createTarGz(sourceDir, outputPath) {
  const parentDir = path.dirname(sourceDir);
  const dirName = path.basename(sourceDir);
  log(`  Creating ${path.basename(outputPath)}...`);
  execSync(`tar czf "${outputPath}" -C "${parentDir}" "${dirName}"`, { stdio: 'inherit' });
}

/**
 * Platform-specific configuration for Node.js downloads and build targets.
 */
const PLATFORM_CONFIG = {
  win32: {
    nodeFilename: (ver) => `node-v${ver}-win-x64.zip`,
    nodeUrl: (ver) => `https://nodejs.org/dist/v${ver}/node-v${ver}-win-x64.zip`,
    nodeBinary: 'node.exe',
    extract: extractZip,
    archiveSuffix: 'win-x64',
    sharpKeep: ['sharp-win32-x64', 'colour'],
  },
  linux: {
    nodeFilename: (ver) => `node-v${ver}-linux-x64.tar.gz`,
    nodeUrl: (ver) => `https://nodejs.org/dist/v${ver}/node-v${ver}-linux-x64.tar.gz`,
    nodeBinary: 'node',
    extract: extractTarball,
    archiveSuffix: 'linux-x64',
    sharpKeep: ['sharp-linux-x64', 'colour'],
  },
  darwin: {
    nodeFilename: (ver) => `node-v${ver}-darwin-x64.tar.gz`,
    nodeUrl: (ver) => `https://nodejs.org/dist/v${ver}/node-v${ver}-darwin-x64.tar.gz`,
    nodeBinary: 'node',
    extract: extractTarball,
    archiveSuffix: 'darwin-x64',
    sharpKeep: ['sharp-darwin-x64', 'colour'],
  },
};

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
 * Clean directory (remove and recreate)
 */
function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
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
 * Strip unnecessary platform binaries and dev-only packages from node_modules.
 *
 * @param {string} nodeModulesDir - Path to node_modules directory
 * @param {string[]} [sharpKeep] - @img/sharp-* prefixes to keep (default: Windows)
 */
function stripUnnecessaryModules(nodeModulesDir, sharpKeep) {
  if (!fs.existsSync(nodeModulesDir)) return;

  sharpKeep = sharpKeep || ['sharp-win32-x64', 'colour'];
  let savedBytes = 0;

  // 1. Remove non-target-platform @img/sharp-* packages
  const imgDir = path.join(nodeModulesDir, '@img');
  if (fs.existsSync(imgDir)) {
    const entries = fs.readdirSync(imgDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (sharpKeep.some(p => entry.name.startsWith(p))) continue;
      const dirPath = path.join(imgDir, entry.name);
      const size = getDirSize(dirPath);
      fs.rmSync(dirPath, { recursive: true, force: true });
      savedBytes += size;
    }
  }

  // 2. Remove dev-only packages not needed at runtime
  const devOnlyPackages = ['typescript'];
  for (const pkg of devOnlyPackages) {
    const pkgDir = path.join(nodeModulesDir, pkg);
    if (fs.existsSync(pkgDir)) {
      const size = getDirSize(pkgDir);
      fs.rmSync(pkgDir, { recursive: true, force: true });
      savedBytes += size;
    }
  }

  if (savedBytes > 0) {
    logSuccess(`Stripped ${(savedBytes / 1024 / 1024).toFixed(1)} MB of unnecessary platform/dev packages`);
  }
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

    const innerModules = path.join(pnpmDir, entry.name, 'node_modules');
    if (!fs.existsSync(innerModules)) continue;

    const pkgEntries = fs.readdirSync(innerModules, { withFileTypes: true });
    for (const pkgEntry of pkgEntries) {
      if (!pkgEntry.isDirectory()) continue;

      let pkgName = pkgEntry.name;
      let srcPkgDir = path.join(innerModules, pkgName);

      if (pkgName.startsWith('@')) {
        const scopeEntries = fs.readdirSync(srcPkgDir, { withFileTypes: true });
        for (const scopeEntry of scopeEntries) {
          if (!scopeEntry.isDirectory()) continue;
          const scopedSrc = path.join(srcPkgDir, scopeEntry.name);
          const scopedDest = path.join(nodeModulesDir, pkgName, scopeEntry.name);
          if (mergePackageDir(scopedSrc, scopedDest)) fixed++;
        }
      } else {
        const destPkgDir = path.join(nodeModulesDir, pkgName);
        if (mergePackageDir(srcPkgDir, destPkgDir)) fixed++;
      }
    }
  }

  if (fixed > 0) {
    logSuccess(`Fixed ${fixed} incomplete package(s) from .pnpm`);
  }
}

/**
 * Merge files from src into dest, only copying files that don't exist in dest.
 */
function mergePackageDir(src, dest) {
  if (!fs.existsSync(src)) return false;

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
        if (mergePackageDir(srcPath, destPath)) added = true;
      }
    } catch {
      continue;
    }
  }

  return added;
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

  try {
    const result = execSync('where makensis', { encoding: 'utf8' }).trim().split('\n')[0];
    if (result && fs.existsSync(result)) return result;
  } catch { /* not in PATH */ }

  return null;
}

/**
 * Build an NSIS installer from a source directory.
 */
function buildNsisInstaller(makensisPath, opts) {
  const tempDir = path.join(DIST_DIR, 'nsis-temp');
  cleanDir(tempDir);

  copyDir(opts.sourceDir, path.join(tempDir, 'files'));

  let iconDirective = '';
  let unIconDirective = '';
  if (opts.iconFile && fs.existsSync(opts.iconFile)) {
    const iconDest = path.join(tempDir, 'icon.ico');
    fs.copyFileSync(opts.iconFile, iconDest);
    iconDirective = `!define MUI_ICON "${iconDest.replace(/\\/g, '\\\\')}"`;
    unIconDirective = `!define MUI_UNICON "${iconDest.replace(/\\/g, '\\\\')}"`;
  }

  const dataDirChecks = (opts.dataDirs || []).map(d =>
    `  RMDir /r "$INSTDIR\\${d}"`
  ).join('\n');

  const uninstallRemove = (opts.dataDirs && opts.dataDirs.length > 0)
    ? `  ; Ask user about data preservation
  MessageBox MB_YESNO "Do you want to keep your budget data?$\\r$\\n$\\r$\\nClick Yes to keep your data (you can use it if you reinstall).$\\r$\\nClick No to delete all data." IDYES SkipDataDelete
${dataDirChecks}
  SkipDataDelete:`
    : '';

  const nsisScript = `
; NSIS Installer Script for ${opts.name}
; Generated by build scripts

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

  execSync(`"${makensisPath}" "${nsisScriptPath}"`, { stdio: 'inherit' });

  fs.rmSync(tempDir, { recursive: true, force: true });
}

module.exports = {
  // Constants
  APP_VERSION,
  NODE_VERSION,
  PROJECT_ROOT,
  DIST_DIR,
  STANDALONE_DIR,
  NODE_CACHE_DIR,
  DISTRIBUTE_DIR,
  PLATFORM_CONFIG,
  colors,

  // Logging
  log,
  logStep,
  logSuccess,
  logWarning,
  logError,

  // File operations
  downloadFile,
  extractZip,
  extractTarball,
  createTarGz,
  copyDir,
  cleanDir,
  getDirSize,
  stripUnnecessaryModules,
  fixPnpmLayout,
  mergePackageDir,

  // Installer tools
  findMakeNsis,
  buildNsisInstaller,
};
