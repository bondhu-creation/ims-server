@echo off
REM Stop the local IMS development database cleanly (fast mode: disconnects clients, then checkpoints).
REM Run this before shutting down the PC to avoid a crash-recovery on the next start.
setlocal

if not defined PG_LOCAL_HOME set "PG_LOCAL_HOME=%USERPROFILE%\pgsql-local"
set "BIN=%PG_LOCAL_HOME%\pgsql\bin"
set "DATA=%PG_LOCAL_HOME%\data"
set "EXIT_CODE=0"

"%BIN%\pg_ctl.exe" -D "%DATA%" status >nul 2>&1
if not %errorlevel%==0 (
      echo [stop-db] Local database is not running.
      goto :end
)

"%BIN%\pg_ctl.exe" -D "%DATA%" -m fast -w stop
if errorlevel 1 set "EXIT_CODE=1"

:end
echo %CMDCMDLINE% | find /i "%~nx0" >nul && pause
exit /b %EXIT_CODE%
