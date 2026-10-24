@echo off
cd /d "%~dp0.."
if not exist node_modules (
  echo Installing USB-AI Web dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:5173/'"
call npm run dev -- --host 127.0.0.1
