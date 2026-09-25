@echo off
REM Start the local IMS development database (PostgreSQL 17.6, port 5433) on demand.
REM Safe to run repeatedly. Recovers from an unclean shutdown (PC restart, crash):
REM a stale postmaster.pid is removed only when no postgres process owns it, and
REM PostgreSQL replays its WAL on start, so no data is lost.
REM Set PG_LOCAL_HOME to override the install folder (default: %USERPROFILE%\pgsql-local).
setlocal

if not defined PG_LOCAL_HOME set "PG_LOCAL_HOME=%USERPROFILE%\pgsql-local"
set "BIN=%PG_LOCAL_HOME%\pgsql\bin"
set "DATA=%PG_LOCAL_HOME%\data"
set "LOG=%PG_LOCAL_HOME%\server.log"
set "PORT=5433"
set "EXIT_CODE=0"

if not exist "%BIN%\pg_ctl.exe" (
      echo [start-db] PostgreSQL not found at "%BIN%". Set PG_LOCAL_HOME to the pgsql-local folder.
      set "EXIT_CODE=1"
      goto :end
)

REM 1. Already running? Nothing to do.
"%BIN%\pg_ctl.exe" -D "%DATA%" status >nul 2>&1
if %errorlevel%==0 (
      echo [start-db] Local database is already running.
      goto :ready
)

REM 2. Something else answering on the port? Do not start a second server.
"%BIN%\pg_isready.exe" -h localhost -p %PORT% >nul 2>&1
if %errorlevel% lss 2 (
      echo [start-db] Port %PORT% is used by another server. Stop it first, then run this again.
      set "EXIT_CODE=1"
      goto :end
)

REM 3. Unclean shutdown leaves postmaster.pid behind. Remove it only if no postgres.exe holds that PID.
if exist "%DATA%\postmaster.pid" (
      call :clear_stale_pid
      if errorlevel 1 (
            set "EXIT_CODE=1"
            goto :end
      )
)

REM 4. Start and wait. Crash recovery, if needed, runs automatically here.
echo [start-db] Starting local database...
"%BIN%\pg_ctl.exe" -D "%DATA%" -l "%LOG%" -w -t 90 start >nul
if errorlevel 1 (
      echo [start-db] Failed to start. Last lines of %LOG%:
      powershell -NoProfile -Command "Get-Content -Tail 20 '%LOG%'"
      set "EXIT_CODE=1"
      goto :end
)

:ready
"%BIN%\pg_isready.exe" -h localhost -p %PORT%
echo [start-db] Connect with host=localhost port=%PORT% db=ims_local user=postgres

:end
REM Keep the window open when started by double-click so the result can be read.
echo %CMDCMDLINE% | find /i "%~nx0" >nul && pause
exit /b %EXIT_CODE%

:clear_stale_pid
REM postmaster.pid uses LF line endings, so read only its first line (the PID) with for /f.
set "STALE_PID="
for /f "usebackq delims=" %%p in ("%DATA%\postmaster.pid") do if not defined STALE_PID set "STALE_PID=%%p"
if not defined STALE_PID (
      echo [start-db] postmaster.pid is empty. Removing it.
      del "%DATA%\postmaster.pid"
      exit /b 0
)
tasklist /FI "PID eq %STALE_PID%" /FI "IMAGENAME eq postgres.exe" 2>nul | find /i "postgres.exe" >nul
if %errorlevel%==0 (
      echo [start-db] postgres.exe PID %STALE_PID% is alive but not responding. Stop it in Task Manager, then run this again.
      exit /b 1
)
echo [start-db] Previous shutdown was not clean. Removing stale postmaster.pid (PID %STALE_PID%).
del "%DATA%\postmaster.pid"
exit /b 0
