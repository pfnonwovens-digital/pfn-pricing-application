@echo off
REM Local development server startup with email configuration

set SMTP_HOST=smtp.seznam.cz
set SMTP_PORT=587
set SMTP_USER=fischer.martin@email.cz
set SMTP_PASS=ziz33kov
set SMTP_FROM_EMAIL=fischer.martin@email.cz
set NODE_ENV=development

echo [Startup] Email configuration:
echo   SMTP_HOST: %SMTP_HOST%
echo   SMTP_PORT: %SMTP_PORT%
echo   SMTP_USER: %SMTP_USER%
echo   SMTP_FROM_EMAIL: %SMTP_FROM_EMAIL%
echo.
echo [Startup] Starting Node server...
echo.

node server.js
