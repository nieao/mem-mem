@echo off
setlocal enabledelayedexpansion
title LobsterTown - Stop

echo.
echo   ========================================
echo     LobsterTown - Stopping...
echo   ========================================
echo.

:: Kill port 3456
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3456 " ^| findstr "LISTENING"') do (
    echo   Stopping server ^(PID: %%a^)...
    taskkill /F /PID %%a >nul 2>&1
)

:: Kill named windows
taskkill /FI "WINDOWTITLE eq LobsterTown Server" /F >nul 2>&1

echo.
echo   All services stopped.
echo.
pause

endlocal
