@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.3 or newer, then run this file again.
  pause
  exit /b 1
)
if not exist "node_modules\pdf-parse\package.json" (
  echo Installing the syllabus document readers. Internet is needed for first setup.
  call npm ci
  if errorlevel 1 (
    echo Setup failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
echo Open http://127.0.0.1:4310 in your browser after the server starts.
node server/index.mjs
pause
