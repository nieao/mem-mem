@echo off
setlocal enabledelayedexpansion
title LobsterTown - Startup

echo.
echo   ========================================
echo     LobsterTown - Startup Script
echo   ========================================
echo.

set "SCRIPT_DIR=%~dp0"

:: 1. Check and clean port 3456
echo [1/5] Checking port 3456...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3456 " ^| findstr "LISTENING"') do (
    echo   Port 3456 in use ^(PID: %%a^), killing...
    taskkill /F /PID %%a >nul 2>&1
)
echo   Port check done
echo.

:: 2. Check Bun runtime
echo [2/5] Checking Bun runtime...
where bun >nul 2>&1
if errorlevel 1 (
    echo   ERROR: Bun not found in PATH
    echo   Install: https://bun.sh
    pause
    exit /b 1
)
echo   Bun found
echo.

:: 3. Check dependencies
echo [3/5] Checking dependencies...
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
echo   Dependencies ready
echo.

:: 4. Check local services
echo [4/5] Checking local services...
curl -s http://localhost:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo   Ollama: OFFLINE (ollama cards will use mock)
) else (
    echo   Ollama: ONLINE
)
curl -s http://localhost:8188/api/system_stats >nul 2>&1
if errorlevel 1 (
    echo   ComfyUI: OFFLINE (comfyui cards will use mock)
) else (
    echo   ComfyUI: ONLINE
)
echo.

:: 5. Start server
echo [5/5] Starting LobsterTown server...
cd /d "%SCRIPT_DIR%"
start "LobsterTown-Server" cmd /k "title LobsterTown Server && bun run src/server.ts --mock"
timeout /t 3 /nobreak >nul
echo.

:: Done
echo   ========================================
echo     LobsterTown is running!
echo   ========================================
echo.
echo     Server:   http://localhost:3456
echo     Onboard:  http://localhost:3456/api/openclaw/onboard
echo     Health:   http://localhost:3456/api/admin/health
echo     Cards:    http://localhost:3456/api/cards
echo     Bounties: http://localhost:3456/api/bounties
echo.

:: Auto open browser
echo Opening browser...
timeout /t 2 /nobreak >nul
start "" "http://localhost:3456"

echo Press any key to close this window...
pause >nul

endlocal
