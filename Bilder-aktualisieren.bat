@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist node_modules (
  echo Erster Start: installiere benoetigte Pakete ...
  call npm install
  echo.
)

call npm run build:images

echo.
echo Fertig. Dieses Fenster mit einer beliebigen Taste schliessen.
pause >nul
