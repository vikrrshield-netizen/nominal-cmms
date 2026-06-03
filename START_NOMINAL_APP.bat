@echo off
cd /d "%~dp0"
echo Starting NOMINAL CMMS...
start "NOMINAL CMMS server" cmd /k "npm.cmd run dev -- --host 127.0.0.1"
timeout /t 4 /nobreak >nul
start "" "http://127.0.0.1:5173"
