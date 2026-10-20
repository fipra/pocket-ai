@echo off
cd /d "%~dp0"
if not exist node_modules (echo Prima eseguire npm install e npm run model:download. & pause & exit /b 1)
call npm start
pause
