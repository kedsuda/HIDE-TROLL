@echo off
chcp 65001 >nul
title HIDE ^& TROLL Server
cd /d "%~dp0"
if not exist node_modules (
  echo Installing... please wait
  call npm install
)
start "" http://localhost:3000
echo.
echo  HIDE ^& TROLL is running at http://localhost:3000
echo  Friends on the same Wi-Fi: http://YOUR-IP:3000
echo  Close this window to stop the server.
echo.
node server\server.js
pause
