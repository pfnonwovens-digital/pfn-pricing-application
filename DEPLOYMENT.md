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

- App database: `src/data/mini_erp.db`
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

Optional:

- `PORT` (App Service usually sets this automatically)

## Operational Checks

After deployment verify:

- `GET /api/health` returns 200
- Login flow works
- Dashboard loads
- Polymer indexes page loads

## Backup and Restore

Recommended backup targets:

- Full project zip
- `src/data/mini_erp.db`
- deployment configuration

Restore pattern:

1. Restore codebase
2. Restore database file
3. Run `npm install`
4. Start app and validate `/api/health`

## Security Checklist

- Enforce HTTPS
- Rotate JWT secret for production
- Restrict admin access
- Monitor logs and failed login attempts
- Keep dependencies updated
