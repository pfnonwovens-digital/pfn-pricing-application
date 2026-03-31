# Manufacturing Cost ERP System

Node.js + Express + vanilla JavaScript ERP for manufacturing cost analysis, product editing, BOM design, polymer index management, and raw material price governance.

## Documentation Map

Use these files as the canonical documentation set:

- [README.md](README.md): Project overview, quick start, key features, structure
- [API.md](API.md): HTTP routes, endpoints, and payload reference
- [DEPLOYMENT.md](DEPLOYMENT.md): Local and production deployment steps
- [POLYMER_INDEXES_DOCUMENTATION.md](POLYMER_INDEXES_DOCUMENTATION.md): Polymer index workflows, data model, chart feature, Mid auto-calc, data operations
- [CHANGELOG.md](CHANGELOG.md): Recent changes and feature updates

## Terminology Conventions

- **Derived Mid value**: Mid polymer index is a derived value computed as `Mid = (Min + Max) / 2`.
- **Dry-run**: Execution mode that validates and reports changes without persisting data.
- **Controlled migration/import**: Script intended for setup, migration, or data import under operational control (backup first, run deliberately).

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
- Admin Access Management panel now includes a per-page Access Permissions matrix for groups (Read/Modify)
- Access Permissions matrix supports row Save, Save All for changed groups, explanatory tooltips, and visual highlighting of unsaved changes
- Admin Access Management includes a Recipe Approval Region matrix (`CZ`, `EG`, `RSA`) to assign users from Admin + Recipe Approvals groups; one user can be assigned to multiple regions
- Per-user effective page permissions are exposed from backend and consumed by admin-sensitive pages (FX rates, polymer pages)
- In RM Prices module, users with page-level `Modify` on `rm-prices` have the same write capabilities as Admin users within the module (price edits, availability updates, roll prices)
- In Line Rates module, users with page-level `Modify` on `line-rates` can import annual rate matrices (same module-level write capability as Admin)
- All module pages enforce Read permission on load: if a non-admin user navigates directly to a module URL without `Read` access, they receive an alert and are redirected to the dashboard. Dashboard tile hiding provides an additional layer (tiles are not rendered for pages the user cannot read)
- Admin Access Management includes a Maintenance tab with a one-click SQLite snapshot download (`GET /api/admin/db-download`)
- Cost dashboard with filters, currency conversion, and export
- Product editor (search, duplicate, update, delete)
- BOM calculator with list-driven dropdowns, throughput calculations, and recipe persistence
- BOM list management backed by SQLite tables (no runtime Excel dependency for dropdown lists)
- Renaming values in BOM shared lists (for example Customer, Market Segment, Application) also updates the corresponding text fields in existing historical BOM recipes, so Recipe Browser filters and saved recipe summaries stay aligned with the edited list values
- BOM recipe save flow with mandatory field validation before database write
- BOM recipe percentage validation enforces `100.00%` on non-surfactant materials only (surfactants, identified by `material_label = 'Surfactant'`, are intentionally excluded because they evaporate during production; the final product gramage is based only on base materials)
- Recipe editor and clone operations apply the same percentage validation: materials with `material_label = 'Surfactant'` are excluded from the 100% sum check
- New BOM and cloned recipes receive server-assigned PD IDs in a contiguous sequence starting at `10000`; IDs freed by Admin delete are reused, and legacy IDs below `10000` are ignored by the allocator
- BOM snapshot storage includes Description fields, Calculation Results material percentages,
  minimum batch size/unit, and commentary notes
- BOM Work in Progress (Save WIP / Load WIP) preserves surfactant rows including concentration + OPU values
- Recipe submission email routing is region-aware: recipients are resolved by recipe line region from the Admin Recipe Approval Region matrix (with optional env fallback)
- If recipe line cannot be mapped to a known region, submission email still uses env fallback recipients (`RECIPE_SUBMISSION_NOTIFY_TO`, `RECIPE_APPROVAL_NOTIFY_TO`, `APPROVAL_NOTIFY_TO`)
- Recipe decision emails sent to authors omit SAP ID in subject/body and omit Recipe ID from the body
- Recipe Approval pending list shows `PD ID` as the first table column (`PD ID`, `Customer`, `Line`, `Author`, `Status`, `Updated`)
- Recipe Edit/Clone includes Created and Updated timestamps in the grid and an Admin-only Delete action
- Audit Logs detail rendering now includes `PD ID` plus record context (`Record`, `Source`, `New`, `Action`, `Decision`) for BOM/approval actions
- Raw Material Price Management by plant (CZ, EG, ZA): monthly sheets, missing/fallback statuses, inline edits, and JSON import
- RM Prices page filters: status filter (All/Priced/Fallback/Missing) and real-time material name text search, with all exports respecting the active filters
- RM Prices page exports: Export Sheet CSV and Export Sheet Excel buttons export the currently visible (filtered) sheet; Export Missing exports only missing-price rows
- Delete material globally: removes a material from all database tables in one transaction; per-table deletion counts shown in the Availability Matrix UI
- All price and cost values displayed to 2 decimal places throughout the application (price sheets, dropdown labels, cost dashboard, exports)
- Material Availability Matrix to define where each material is allowed; unavailable combinations are excluded from missing-price checks
- BOM Calculator integration with plant-aware dropdown filtering and inline price labels after line selection
- If line change makes a selected material unavailable, the row is highlighted and a warning banner prompts replacement selection
- FX rates management:
   - Year matrix view with rows by currency pair and columns Budget + months 1..12
   - Missing pairs are auto-derived from available data using direct, inverse, and cross-currency path calculation
   - Budget can be imported directly and, when missing, is auto-filled from the first available month in the selected year
   - Import supports CSV/Excel and flexible column aliases (including `FX_ccy` for currency pair)
- **Polymer index management:**
  - Define index names with variants (Min/Mid/Max) and metadata (unit, currency, publish day)
  - Import historical values from CSV/Excel (up to 10 MB batch)
  - Admin-only bulk data operations (clear all values, recalculate Mid from Min/Max)
  - Weekly data table with sticky headers
  - **Line chart visualization** with selectable index series over chosen year range
  - Mid values are auto-calculated: Mid = (Min + Max) / 2
- **Line Operating Rates Management** (`/line-rates`):
  - Annual operating rates matrix — production lines displayed horizontally, rate categories vertically
  - Rate categories: Energy, Wages, Maintenance, Other Costs, SGA & Overhead (hourly), Cores, Packaging, Pallets (per-ton)
  - Values displayed as integers (no decimal places)
  - Summary section below the main table: total hourly rate and total per-ton rate in line currency and in USD (using the last available monthly FX rate in the selected year)
  - **Single Year View**: select a year and load; export to CSV or Excel
  - **Year Comparison (Δ)**: select two years and a display mode, then load the delta matrix:
    - **Absolute (Δ)**: signed difference per cell (e.g. `+1 200`, `-450`), colour-coded green/red
    - **Percent (%)**: relative change per cell (e.g. `+5.3%`, `-2.1%`); shows `n/a` when base is zero
    - Summary rows adapt to the selected display mode
    - Export (CSV/Excel) reflects the chosen mode and names the file accordingly (e.g. `line-rates-delta-pct-2025-to-2026.xlsx`)
   - Import from CSV/XLSX (admin or page-level `line-rates:modify`; legacy fallback `rm_prices:manage`); supports overwrite flag

## Main Routes

Frontend (primary pages):

- `/` redirects to `/login.html`
- `/dashboard` landing page (module navigation hub)
- `/bom-calculator` BOM calculator
- `/rm-prices` raw material monthly price management
- `/fx-rates` FX rates management matrix
- `/line-rates` line operating rates management
- `/polymer-indexes` polymer index manager

Frontend (supplementary pages):

- `/bom-recipe-browser` BOM recipe browser (view, search, and inspect saved recipes)
- `/recipe-edit-clone` recipe editor and cloning page for approved recipes
- `/recipe-approval` recipe approval workbench for unapproved recipes
- `/rm-prices/availability` raw material availability matrix by plant
- `/request-access.html` user access request form
- `/admin-access.html` admin panel (groups, users, access request workflow, audit logs, and per-page access matrix) — accessible to admins only
- `/polymer-index-admin.html` polymer index definition manager — accessible to admins only

API root:

- `/api/...` (full list in [API.md](API.md))

## Project Structure

```text
mini-erp-node/
├── server.js               # Express app entry point with all routes
├── package.json
├── web.config              # Azure App Service IIS config
├── data/                   # Source Excel files, SQLite DB (mini_erp.db), logo
├── scripts/                # Setup, migration, import, and analysis tooling
└── src/
   ├── backend/            # Auth, BOM, costing, products, polymer index, raw material pricing modules
    └── frontend/           # HTML pages and client-side scripts
```

## Script Catalog

All scripts in `scripts/` are considered part of this project. Some are recurring maintenance utilities, while others are controlled migration/import tools.

### Core Setup and Maintenance

- `scripts/setup.js`
   - Initializes base application data and setup flow.
- `scripts/seed-admin.js`
   - Seeds default admin/test access data.
- `scripts/create-admin.js`
   - Creates an admin user.
- `scripts/setup-groups.js`
   - Initializes access groups/permissions.
- `scripts/migrate-users-to-groups.js`
   - Migrates existing users to the groups model.
- `scripts/migrate-unit-currency.js`
   - Migration utility for unit/currency related fields.
- `scripts/remove-source-field.js`
   - Data/schema cleanup migration utility.
- `scripts/cleanup-indexes.js`
   - Maintenance cleanup for polymer index data.
- `scripts/send-index-reminders.js`
   - Sends planned reminders for index publication workflow.

### Data Import and Backfill Utilities

- `scripts/import-products-to-bom.js`
   - Controlled import from `data/Products.xlsx` into BOM tables (duplicate-safe and re-runnable).
   - Writes to `bom_records` and `bom_record_materials`.
- `scripts/backfill-bom-overconsumption.js`
   - Adds/backfills `overconsumption` in BOM records from product source data.
   - Updates `bom_records`.
- `scripts/add-missing-materials.js`
   - Adds missing materials into dropdown and plant-availability tables.
   - Writes to `bom_dropdown_list_items` and `rm_plant_materials`.
- `scripts/import-rawmat-prices.js`
   - Imports raw material prices from `data/RawMat_prices.xlsx` using mapping rules.
   - Default mode is dry-run; add `--apply` to persist.
   - Writes through RM prices module to `rm_prices` and related material tables.
- `scripts/import-raffia-data.js`
   - Dedicated import utility for raffia-related source data.

### Mapping and Analysis Helpers

- `scripts/products-to-bom-material-mapping.csv`
   - Canonical mapping of source material names to DB material names.
   - Used by BOM and RM import tooling.
- `scripts/analyze-rawmat-price-mapping.js`
   - Read-only analysis of matching coverage between source prices and DB materials.
   - Produces diagnostics (matched/unmatched samples).
- `scripts/suggest-rawmat-price-mapping.js`
   - Read-only matching helper suggesting canonical mappings.
   - Produces diagnostics for mapping refinement.

### Operational Notes

- Back up `data/mini_erp.db` before any script that writes data.
- Prefer dry-run/analysis first (`import-rawmat-prices.js` without `--apply`).
- Run controlled migration/backfill scripts once per environment unless explicitly designed to be re-runnable.
- Execute scripts from project root so relative paths resolve correctly.

## Data and Database Notes

- Application SQLite database is at `data/mini_erp.db`
- Database path can be overridden with env var `DB_PATH` (relative to project root or absolute path)
- Source Excel files for costing are in `data/`
- Polymer index values are stored separately from index definitions
- BOM calculator persistence uses tables such as `bom_records` and `bom_record_materials`
- Shared BOM dropdown stores (`bom_customers`, `bom_dropdown_lists`, `bom_dropdown_list_items`) are authoritative option sources, while Recipe Browser filters are derived from persisted `bom_records` values; shared-list renames are therefore propagated into matching historical `bom_records` text columns
- Raw material pricing uses `rm_prices`, `rm_polymer_formulas`, and `rm_plant_materials`

### Moving DB Between Environments (Web → Local)

- SQLite DB files are intentionally ignored by git (`data/*.db`, `data/*.db-wal`, `data/*.db-shm`).
- On deployed environments, admins can download a live DB snapshot directly from Admin Access → Maintenance (`GET /api/admin/db-download`).
- Export current local DB snapshot:
   - `npm run db:export`
   - Optional custom output path: `npm run db:export -- --out=backups/my-snapshot.db`
- Import DB snapshot into local environment:
   - Stop server first
   - `npm run db:import -- --src=backups/mini_erp-YYYYMMDD-HHMMSS.db --force`
   - Import script auto-creates backup of current local DB into `backups/`
- After import, start server (`npm start`) so runtime migrations can apply if needed.

## Security Notes

- Change JWT secret for production
- Keep production behind HTTPS
- Restrict admin access to trusted users/groups

See [DEPLOYMENT.md](DEPLOYMENT.md) for production hardening details.
