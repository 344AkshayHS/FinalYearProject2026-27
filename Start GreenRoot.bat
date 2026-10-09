@echo off
rem Double-click to start GreenRoot on this PC: the ML service, the backend with the website, and (when it is set up)
rem the internet tunnel that lets any phone reach this PC. How it works: start-greenroot.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-greenroot.ps1"
pause
