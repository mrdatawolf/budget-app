# Budget App Installer & Distribution

This directory contains everything needed to create self-contained distributions of Budget App for Windows, Linux, and macOS.

## What Gets Installed

Each distribution is a standalone Budget App with:
- **Hono API server** — handles all data operations (port 3401)
- **Next.js web client** — serves the UI (port 3400)
- **PGlite database** — local PostgreSQL (no external DB needed)
- **Bundled Node.js** — no system Node.js required

## Prerequisites (For Building)

1. **Node.js 20+** and **pnpm** — For building the app
2. **NSIS 3+** — For creating Windows `.exe` installers (optional)
   - Download from: https://nsis.sourceforge.io/Download
   - Or: `winget install NSIS.NSIS`

## Building

### All Platforms (Windows + Linux + macOS)

```bash
pnpm build:all
```

This runs the Windows build first (full Next.js + API server build), then creates Linux and macOS packages reusing the same build artifacts.

### Windows Only

```bash
# Full build with NSIS installer
pnpm build:installer

# Full build without NSIS installer (just distribution folders)
pnpm build:standalone

# Skip app build, repackage only
pnpm build:installer:quick
```

### Linux Only

```bash
# Full build (builds app + creates Linux packages)
pnpm build:linux

# Skip app build (use existing build artifacts)
pnpm build:linux:quick
```

### macOS Only

```bash
# Full build
pnpm build:darwin

# Skip app build
pnpm build:darwin:quick
```

### Manual / Advanced

```bash
# Build app once, then package for specific platforms
pnpm build:standalone                                              # Windows
node installer/build-cross-platform.js --platform linux --skip-build   # Linux
node installer/build-cross-platform.js --platform darwin --skip-build  # macOS

# Build for all non-Windows platforms at once
node installer/build-cross-platform.js --platform all --skip-build

# Skip archive creation (just folders, no .tar.gz)
node installer/build-cross-platform.js --platform linux --skip-build --skip-archive
```

## Output

After building, you'll find distribution packages in `distribute/`:

### Windows
```
distribute/
  BudgetApp-Server-0.9.3/           # API server only
  BudgetApp-Client-0.9.3/           # Web client only
  BudgetApp-Full-0.9.3/             # Combined (server + client)
  BudgetApp-Full-0.9.3-Setup.exe    # NSIS installer (if NSIS installed)
```

### Linux
```
distribute/
  BudgetApp-Server-0.9.3-linux-x64/
  BudgetApp-Client-0.9.3-linux-x64/
  BudgetApp-Full-0.9.3-linux-x64/
  BudgetApp-Full-0.9.3-linux-x64.tar.gz    # Ready to distribute
  BudgetApp-Server-0.9.3-linux-x64.tar.gz
  BudgetApp-Client-0.9.3-linux-x64.tar.gz
```

### macOS
```
distribute/
  BudgetApp-Full-0.9.3-darwin-x64/
  BudgetApp-Full-0.9.3-darwin-x64.tar.gz
  ...
```

## Installing on Linux / macOS

1. Extract the archive:
   ```bash
   tar xzf BudgetApp-Full-0.9.3-linux-x64.tar.gz
   cd BudgetApp-Full-0.9.3-linux-x64
   ```

2. Set permissions (required after extracting on a new machine):
   ```bash
   chmod +x install.sh && ./install.sh
   ```

3. Start the app:
   ```bash
   ./start.sh
   ```

4. Open http://localhost:3400 in your browser.

5. To stop:
   ```bash
   ./stop.sh
   ```

## Architecture

```
start.sh / start.bat
  └── node start-production.js (or start.js)
        ├── Spawns: node api-server/index.mjs  (port 3401)
        │   └── Hono API server with PGlite database
        ├── Waits for API health check
        ├── Spawns: node server.js             (port 3400)
        │   └── Next.js (proxies /api/* → :3401)
        └── Opens browser to http://localhost:3400
```

## Package Types

| Package | Contents | Use Case |
|---------|----------|----------|
| **Server** | API server + Node.js + PGlite | Run API on a server, connect client from another machine |
| **Client** | Next.js web app + Node.js | Connect to an API server running elsewhere |
| **Full** | Server + Client combined | Self-contained, single-machine deployment |

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

**Note:** The API port is baked into the Next.js build (for the `/api/*` proxy). Changing `API_PORT` after installation requires rebuilding.

## Windows Installer Features

- **Desktop shortcut** and **Start menu entries**
- **Data preservation** — Asks to keep data on uninstall
- **Self-contained** — Bundled Node.js, no system dependencies

## Customization

### Change App Icon

Place a 256x256 ICO file at `public/icon.ico` before building.

## Troubleshooting

### "Port 3400/3401 already in use"

Another application is using the port. Either:
- Stop the other application
- Run `stop.sh` / `stop.bat` to stop a previous Budget App instance
- Change the port in `.env` (API port change requires rebuild)

### "Node.js not found"

The bundled `node` binary is missing. Re-run the build script or ensure the archive was extracted correctly. On Linux/macOS, run `./install.sh` to set executable permissions.

### Server crashes immediately

Check the console output for errors. Common issues:
- Database initialization failure (check `data/` directory permissions)
- Missing PGlite WASM files (check `api-server/node_modules/@electric-sql/pglite/dist/`)

## Files in This Directory

| File | Purpose |
|------|---------|
| `build-installer.js` | Windows build: Next.js + esbuild + packaging + NSIS installers |
| `build-cross-platform.js` | Linux/macOS build: cross-platform packaging with .tar.gz archives |
| `build-utils.js` | Shared utilities used by both build scripts |
| `start-production.js` | Node.js script that starts both API and web servers (platform-aware) |
| `budget-app.iss` | Legacy Inno Setup script (NSIS is now preferred) |
| `start.bat` | Windows batch file to launch the app |
| `stop.bat` | Windows batch file to stop the app |
| `README.md` | This file |
