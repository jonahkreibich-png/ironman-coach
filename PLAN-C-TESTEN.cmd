@echo off
cd /d "%~dp0"
node "%~dp0scripts\plan-c-test.mjs" %*
set "PLAN_C_EXIT=%ERRORLEVEL%"
echo.
echo Ergebnis steht in PLAN-C-STATUS.txt.
pause
exit /b %PLAN_C_EXIT%
