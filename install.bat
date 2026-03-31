@echo off
setlocal enabledelayedexpansion
title LobsterTown - One-Click Installer

echo.
echo   ========================================
echo     LobsterTown - One-Click Installer
echo     OpenClaw Discussion Town Simulator
echo   ========================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: ============================================
:: Step 1: Check and install Bun
:: ============================================
echo [1/4] Checking Bun runtime...
where bun >nul 2>&1
if errorlevel 1 (
    echo   Bun not found. Installing Bun...
    echo.
    powershell -Command "irm bun.sh/install.ps1 | iex"
    if errorlevel 1 (
        echo   ERROR: Bun install failed.
        echo   Please install manually: https://bun.sh
        pause
        exit /b 1
    )
    :: Refresh PATH for current session
    set "BUN_INSTALL=%USERPROFILE%\.bun"
    set "PATH=%BUN_INSTALL%\bin;%PATH%"
    where bun >nul 2>&1
    if errorlevel 1 (
        echo   ERROR: Bun installed but not in PATH.
        echo   Please restart terminal and run this script again.
        pause
        exit /b 1
    )
    echo   Bun installed successfully!
) else (
    for /f "tokens=*" %%v in ('bun --version 2^>nul') do echo   Bun v%%v found
)
echo.

:: ============================================
:: Step 2: Install dependencies
:: ============================================
echo [2/4] Installing dependencies...
cd /d "%SCRIPT_DIR%"
if exist "node_modules" (
    echo   node_modules exists, running bun install to sync...
)
call bun install
if errorlevel 1 (
    echo   ERROR: bun install failed
    pause
    exit /b 1
)
echo   Dependencies ready
echo.

:: ============================================
:: Step 3: TypeScript check
:: ============================================
echo [3/4] Verifying TypeScript...
cd /d "%SCRIPT_DIR%"
call bun x tsc --noEmit >nul 2>&1
if errorlevel 1 (
    echo   WARNING: TypeScript check found issues (non-blocking)
) else (
    echo   TypeScript check passed
)
echo.

:: ============================================
:: Step 4: Clean port and start server
:: ============================================
echo [4/4] Starting LobsterTown...

:: Kill existing process on port 3456
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3456 " ^| findstr "LISTENING"') do (
    echo   Port 3456 in use ^(PID: %%a^), killing...
    taskkill /F /PID %%a >nul 2>&1
)

:: Check optional local services
curl -s http://localhost:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo   Ollama: OFFLINE ^(will use mock^)
) else (
    echo   Ollama: ONLINE
)
echo.

:: Start server (mock mode by default for zero API cost)
cd /d "%SCRIPT_DIR%"
start "LobsterTown-Server" cmd /k "title LobsterTown Server && bun run src/server.ts --mock"
timeout /t 3 /nobreak >nul

:: Done
echo.
echo   ========================================
echo     Install complete! LobsterTown is up!
echo   ========================================
echo.
echo     Homepage:  http://localhost:3456
echo     Guide:     http://localhost:3456/guide
echo     Onboard:   http://localhost:3456/api/openclaw/onboard
echo     Health:    http://localhost:3456/api/admin/health
echo.
echo     To stop:   run stop.bat
echo     To start:  run start.bat
echo.

:: Auto open browser
echo Opening browser...
timeout /t 2 /nobreak >nul
start "" "http://localhost:3456"

echo Press any key to close this window...
pause >nul

endlocal
