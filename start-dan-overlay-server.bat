@echo off
cd /d "%~dp0"
echo Starting Dan Overlay companion server on port 24051...
echo Keep this window open while using the Dan Overlay counter.
echo.

:: Pre-create settings directories and empty values files so tosu doesn't
:: throw ENOENT on first load before the user has saved settings.
if not exist "settings\dan-overlay" mkdir "settings\dan-overlay"
if not exist "settings\dan-overlay\dan-overlay.values.json" echo {} > "settings\dan-overlay\dan-overlay.values.json"

set "portdir=dan-overlay-port by Ottowa"
if not exist "settings\%portdir%" mkdir "settings\%portdir%"
for %%i in ("dan-overlay-port by Ottowa" ui-2 ui-3 ui-4 ui-5 ui-6) do (
    if not exist "settings\%portdir%\%%~i.values.json" echo {} > "settings\%portdir%\%%~i.values.json"
)

python "static\dan-overlay-port by Ottowa\dan-overlay-server.py"
pause
