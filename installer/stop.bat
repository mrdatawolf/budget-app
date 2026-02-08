@echo off
:: Budget App Server Stop Script
:: Stops the running Budget App server (API + Web)

echo Stopping Budget App server...

:: Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"

:: Try to read PID file first (cleanest approach)
set "PID_FILE=%SCRIPT_DIR%data\.pid"
if exist "%PID_FILE%" (
    set /p MAIN_PID=<"%PID_FILE%"
    echo Stopping main process (PID: %MAIN_PID%)...
    taskkill /pid %MAIN_PID% /f /t >nul 2>nul
    del "%PID_FILE%" >nul 2>nul
    goto :done
)

:: Fallback: find and kill node processes running our scripts
echo No PID file found, searching for running processes...

for /f "tokens=2" %%a in ('tasklist /fi "imagename eq node.exe" /fo list ^| find "PID:"') do (
    wmic process where "ProcessId=%%a" get CommandLine 2>nul | find "start-production.js" >nul
    if not errorlevel 1 (
        echo Stopping process %%a (start-production.js)
        taskkill /pid %%a /f /t >nul 2>nul
    )
    wmic process where "ProcessId=%%a" get CommandLine 2>nul | find "index.mjs" >nul
    if not errorlevel 1 (
        echo Stopping process %%a (API server)
        taskkill /pid %%a /f /t >nul 2>nul
    )
    wmic process where "ProcessId=%%a" get CommandLine 2>nul | find "server.js" >nul
    if not errorlevel 1 (
        echo Stopping process %%a (Web server)
        taskkill /pid %%a /f /t >nul 2>nul
    )
)

:done
echo.
echo Budget App server stopped.
timeout /t 2 >nul
