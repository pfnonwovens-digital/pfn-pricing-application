@echo off
echo [Azure Startup] Checking sqlite3 module...

:: Try to rebuild sqlite3 if build tools are available
cd /d "%HOME%\site\wwwroot"

:: Check if sqlite3 module exists and is working
node -e "try { require('sqlite3'); console.log('sqlite3 OK'); process.exit(0); } catch(e) { console.log('sqlite3 ERROR:', e.message); process.exit(1); }"

IF %ERRORLEVEL% NEQ 0 (
  echo [Azure Startup] sqlite3 module is broken, attempting rebuild...
  
  :: Try to rebuild
  call npm rebuild sqlite3 2>&1
  
  :: Try fresh install if rebuild failed
  IF %ERRORLEVEL% NEQ 0 (
    echo [Azure Startup] Rebuild failed, trying fresh install...
    rd /s /q node_modules\sqlite3 2>nul
    call npm install sqlite3 --force 2>&1
  )
)

echo [Azure Startup] Starting application...
node server.js
