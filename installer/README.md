# Budget App Windows Installer

This directory contains everything needed to create a self-contained Windows installer for Budget App.

## What Gets Installed

The installer creates a standalone Budget App with:
- **Hono API server** — handles all data operations (port 3401)
- **Next.js web client** — serves the UI (port 3400)
- **PGlite database** — local PostgreSQL (no external DB needed)
- **Bundled Node.js** — no system Node.js required

## Prerequisites (For Building)

1. **Node.js 20+** and **pnpm** — For building the app
2. **Inno Setup 6+** — For creating the installer (optional)
   - Download from: https://jrsoftware.org/isinfo.php

## Building the Installer

### Quick Start

```bash
# Full build: Next.js + API server bundle + download Node.js + create installer
pnpm build:installer
```

### Other Build Options

```bash
# Skip Next.js and API server builds (if you already built them)
pnpm build:installer:quick

# Create standalone package without Inno Setup installer
pnpm build:standalone
```

### Manual Build Steps

If you prefer to build step by step:

1. **Build Next.js in standalone mode:**
   ```bash
   pnpm build
   ```

2. **Bundle API server:**
   ```bash
   pnpm build:server:bundle
   ```

3. **Run the build script (skip builds, package only):**
   ```bash
   node installer/build-installer.js --skip-build
   ```

4. **Or compile installer manually with Inno Setup:**
   - Open `installer/budget-app.iss` in Inno Setup
   - Click "Compile" or press F9

## Output Files

After building, you'll find:

```
dist/
├── standalone/              # Self-contained app package
│   ├── server.js            # Next.js web server entry
│   ├── start-production.js  # Dual-server startup script
│   ├── .next/               # Compiled web app
│   ├── public/              # Static assets
│   └── api-server/
│       ├── index.mjs        # Bundled API server (esbuild)
│       └── node_modules/
│           └── @electric-sql/
│               └── pglite/  # PGlite with WASM files
├── node/
│   └── node.exe             # Portable Node.js runtime
└── BudgetApp-2.0.0-Setup.exe  # Windows installer (if Inno Setup installed)
```

## Testing Locally

Before creating the installer, test the standalone build:

```bash
cd dist/standalone
..\node\node.exe start-production.js
```

Then open http://localhost:3400 in your browser.

## Architecture

```
start.bat
  └── node.exe start-production.js
        ├── Spawns: node api-server/index.mjs  (port 3401)
        │   └── Hono API server with PGlite database
        ├── Waits for API health check
        ├── Spawns: node server.js             (port 3400)
        │   └── Next.js (proxies /api/* → :3401)
        └── Opens browser to http://localhost:3400
```

## Installer Features

- **Desktop shortcut** (optional)
- **Start menu entries** — Start/Stop Budget App, Uninstall
- **Auto-start with Windows** (optional)
- **Data preservation** — Asks to keep data on uninstall
- **Port conflict detection** — Warns if port 3400 or 3401 is in use

## User Experience

After installation, users:

1. Double-click "Budget App" shortcut
2. Both servers start and browser opens automatically
3. Use the app at `http://localhost:3400`
4. Data is stored in `%PROGRAMFILES%\Budget App\data\`

## Port Configuration

| Server     | Default Port | Purpose                    |
|-----------|-------------|----------------------------|
| API (Hono) | 3401        | Data operations, database  |
| Web (Next) | 3400        | UI serving, API proxy      |

Ports can be changed by creating a `.env` file in the install directory:
```
API_PORT=3401
SERVER_PORT=3400
```

**Note:** The API port is baked into the Next.js build (for the `/api/*` proxy). Changing `API_PORT` after installation requires rebuilding the Next.js app.

## Customization

### Change App Icon

Place a 256x256 ICO file at `public/icon.ico` before building.

## Troubleshooting

### "Port 3400/3401 already in use"

Another application is using the port. Either:
- Stop the other application
- Run `stop.bat` to stop a previous Budget App instance
- Change the port in `.env` (API port change requires rebuild)

### "Node.js not found"

The `node.exe` file is missing. Re-run the build script or ensure the installer was created correctly.

### Server crashes immediately

Check the console output for errors. Common issues:
- Database initialization failure (check `data/` directory permissions)
- Missing PGlite WASM files (check `api-server/node_modules/@electric-sql/pglite/dist/`)

## Files in This Directory

| File | Purpose |
|------|---------|
| `build-installer.js` | Orchestrates the full build process (Next.js + esbuild + packaging) |
| `start-production.js` | Node.js script that starts both API and web servers |
| `budget-app.iss` | Inno Setup script for creating the Windows installer |
| `start.bat` | Windows batch file to launch the app |
| `stop.bat` | Windows batch file to stop the app |
| `README.md` | This file |
