@echo off
setlocal enabledelayedexpansion
title LobsterTown - Startup

echo.
echo   ========================================
echo     LobsterTown - Startup Script
echo   ========================================
echo.

set "SCRIPT_DIR=%~dp0"

:: 1. Check Bun
where bun >nul 2>&1
if errorlevel 1 (
    echo   ERROR: Bun not found. Run install.bat first.
    pause
    exit /b 1
)

:: 2. Check dependencies
cd /d "%SCRIPT_DIR%"
if not exist "node_modules" (
    echo   Installing dependencies...
    call bun install
    if errorlevel 1 (
        echo   bun install failed
        pause
        exit /b 1
    )
)

:: 3. Clean port 3456
echo [1/2] Checking port 3456...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3456 " ^| findstr "LISTENING"') do (
    echo   Port 3456 in use ^(PID: %%a^), killing...
    taskkill /F /PID %%a >nul 2>&1
)
echo   Port ready
echo.

:: 4. Start server
echo [2/2] Starting LobsterTown server...
cd /d "%SCRIPT_DIR%"
start "LobsterTown-Server" cmd /k "title LobsterTown Server && bun run src/server.ts --mock"
timeout /t 3 /nobreak >nul
echo.

:: Done
echo   ========================================
echo     LobsterTown is running!
echo   ========================================
echo.
echo     Homepage:  http://localhost:3456
echo     Guide:     http://localhost:3456/guide
echo     Onboard:   http://localhost:3456/api/openclaw/onboard
echo     Health:    http://localhost:3456/api/admin/health
echo.

:: Auto open browser
echo Opening browser...
timeout /t 2 /nobreak >nul
start "" "http://localhost:3456"

echo Press any key to close this window...
pause >nul

endlocal
