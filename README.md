# Manufacturing Cost ERP System

Node.js + Express + vanilla JavaScript ERP for manufacturing cost analysis, product editing, BOM design, and polymer index management.

## Documentation Map

Use these files as the canonical documentation set:

- [README.md](README.md): Project overview, quick start, key features, structure
- [API.md](API.md): HTTP routes, endpoints, and payload reference
- [DEPLOYMENT.md](DEPLOYMENT.md): Local and production deployment steps
- [POLYMER_INDEXES_DOCUMENTATION.md](POLYMER_INDEXES_DOCUMENTATION.md): Polymer index workflows, data model, chart feature, Mid auto-calc, data operations
- [CHANGELOG.md](CHANGELOG.md): Recent changes and feature updates
- [INDEX_VARIANT_IMPLEMENTATION.md](INDEX_VARIANT_IMPLEMENTATION.md): Historical implementation notes (reference only)

## Quick Start

1. Install dependencies
   - `npm install`
2. Initialize database and seed admin user
   - `node scripts/setup.js`
3. Start server
   - `npm start`
4. Open
   - `http://localhost:3000/`

Test credentials (created by setup script):

- Email: `testuser@pfnonwovens.com`
- Password: `TestPass123`

## Key Features

- Authenticated web app with role and group based access controls
- Cost dashboard with filters, currency conversion, and export
- Product editor (search, duplicate, update, delete)
- BOM calculator with list-driven dropdowns and throughput calculations
- **Polymer index management:**
  - Define index names with variants (Min/Mid/Max) and metadata (unit, currency, publish day)
  - Import historical values from CSV/Excel (up to 10 MB batch)
  - Admin-only bulk data operations (clear all values, recalculate Mid from Min/Max)
  - Weekly data table with sticky headers
  - **Line chart visualization** with selectable index series over chosen year range
  - Mid values are auto-calculated: Mid = (Min + Max) / 2

## Main Routes

Frontend:

- `/` login page
- `/dashboard` cost dashboard
- `/bom-calculator` BOM calculator
- `/products` product editor
- `/polymer-indexes` polymer index manager

API root:

- `/api/...` (full list in [API.md](API.md))

## Project Structure

```text
mini-erp-node/
├── API.md
├── DEPLOYMENT.md
├── POLYMER_INDEXES_DOCUMENTATION.md
├── INDEX_VARIANT_IMPLEMENTATION.md
├── server.js
├── package.json
├── scripts/
│   ├── setup.js
│   ├── setup-groups.js
│   ├── create-admin.js
│   ├── seed-admin.js
│   ├── cleanup-indexes.js
│   ├── import-raffia-data.js
│   ├── migrate-users-to-groups.js
│   ├── migrate-unit-currency.js
│   ├── remove-source-field.js
│   └── send-index-reminders.js
└── src/
    ├── backend/
    │   ├── auth.js
    │   ├── costing.js
    │   ├── fx.js
    │   ├── lines.js
    │   ├── materials.js
    │   ├── products.js
    │   ├── products-editor.js
    │   └── polymer-indexes.js
    ├── frontend/
    │   ├── index.html
    │   ├── bom-calculator.html
    │   ├── products-editor.html
    │   ├── polymer-indexes.html
    │   ├── app.js
    │   ├── script.js
    │   └── styles.css
    └── data/
        └── mini_erp.db
```

## Data and Database Notes

- Application SQLite database is at `src/data/mini_erp.db`
- Source Excel files for costing are in `data/`
- Polymer index values are stored separately from index definitions

## Security Notes

- Change JWT secret for production
- Keep production behind HTTPS
- Restrict admin access to trusted users/groups

See [DEPLOYMENT.md](DEPLOYMENT.md) for production hardening details.
