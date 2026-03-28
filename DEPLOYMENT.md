# Deployment Guide

## Local Development

Prerequisites:

- Node.js 18+
- npm

Setup:

1. `npm install`
2. `node scripts/setup.js`
3. `npm start`
4. Open `http://localhost:3000`

Default seeded admin account:

- Email: `testuser@pfnonwovens.com`
- Password: `TestPass123`

## Database Paths

- App database: `data/mini_erp.db`
- Source Excel data folder: `data/`

## Azure App Service (Recommended)

1. Create a Web App (Node 18 LTS)
2. Connect repo in Deployment Center
3. Configure app settings:
   - `NODE_ENV=production`
   - `JWT_SECRET=<strong-random-secret>`
4. Deploy from main branch

## Production Environment Settings

Required:

- `NODE_ENV=production`
- `JWT_SECRET` (must be explicitly set)
- `SMTP_HOST` (or `MAIL_HOST`)
- `SMTP_PORT` (usually `587`)
- `SMTP_SECURE` (`false` for port 587, `true` for 465)
- `SMTP_USER` (or `SMTP_USERNAME`)
- `SMTP_PASS` (or `SMTP_PASSWORD`)
- `SMTP_FROM_EMAIL` (or `RECIPE_FROM_EMAIL`)

Optional:

- `PORT` (App Service usually sets this automatically)
- `SMTP_TLS_REJECT_UNAUTHORIZED` (`true` by default)
- `RECIPE_APPROVAL_NOTIFY_TO` (fallback recipients if region matrix has no assignee)
- `RECIPE_SUBMISSION_NOTIFY_TO` (fallback recipients)
- `APPROVAL_NOTIFY_TO` (fallback recipients)

Azure App Service email notes:

- Prefer authenticated SMTP on port `587` with STARTTLS.
- Do not use port `25` (often blocked/restricted).
- After changing App Settings, restart the Web App.
- Verify config via `GET /api/health` and check the `email` section.

## Operational Checks

After deployment verify:

- `GET /api/health` returns 200
- `GET /api/health` shows `email.configured=true`
- Login flow works
- Dashboard loads
- BOM calculator and recipe browser load
- Raw material prices page and availability matrix load
- Polymer indexes page loads

## Backup and Restore

Recommended backup targets:

- Full project zip
- `data/mini_erp.db`
- deployment configuration

Restore pattern:

1. Restore codebase
2. Restore database file
3. Run `npm install`
4. Start app and validate `/api/health`

## Script Execution Policy

The `scripts/` folder is part of the project and includes setup, migration, import, and analysis tooling.

Operational guidance:

- Run scripts from project root (`mini-erp-node/`) so relative paths resolve correctly.
- Always back up `data/mini_erp.db` before write scripts.
- Prefer dry-run style execution before persistence where supported (for example, `import-rawmat-prices.js` without `--apply`).
- Treat controlled migration/backfill scripts as deliberate operations per environment.

## Security Checklist

- Enforce HTTPS
- Rotate JWT secret for production
- Restrict admin access
- Monitor logs and failed login attempts
- Keep dependencies updated
