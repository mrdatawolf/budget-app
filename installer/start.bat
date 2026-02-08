@echo off
setlocal enabledelayedexpansion

:: Budget App Server Startup Script
:: Starts both the API server and web client

title Budget App Server

:: Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: Set default environment variables
set "NODE_ENV=production"
set "API_PORT=3401"
set "SERVER_PORT=3400"

:: Load .env file if it exists (override defaults)
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        :: Skip comments and empty lines
        set "line=%%a"
        if not "!line:~0,1!"=="#" (
            if "%%a"=="API_PORT" set "API_PORT=%%b"
            if "%%a"=="SERVER_PORT" set "SERVER_PORT=%%b"
            if "%%a"=="PGLITE_DB_LOCATION" set "PGLITE_DB_LOCATION=%%b"
        )
    )
)

:: Use local data directory for PGlite
if not exist "data" mkdir data
set "PGLITE_DB_LOCATION=%SCRIPT_DIR%data\budget-local"

:: Check if Node.js is available (either bundled or system)
if exist "node.exe" (
    set "NODE_CMD=%SCRIPT_DIR%node.exe"
) else (
    where node >nul 2>nul
    if errorlevel 1 (
        echo ERROR: Node.js not found!
        echo Please install Node.js from https://nodejs.org
        echo Or ensure node.exe is in the same directory as this script.
        pause
        exit /b 1
    )
    set "NODE_CMD=node"
)

:: Check if start-production.js exists
if not exist "start-production.js" (
    echo ERROR: start-production.js not found!
    echo This may indicate an incomplete installation.
    echo Please reinstall Budget App.
    pause
    exit /b 1
)

:: Start the dual-server production script
"%NODE_CMD%" start-production.js

:: If we get here, the server stopped
echo.
echo Server stopped.
pause
