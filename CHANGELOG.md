# Changelog

All notable changes to the Mini ERP system are documented here. For current feature and API documentation, see [README.md](README.md), [API.md](API.md), and [POLYMER_INDEXES_DOCUMENTATION.md](POLYMER_INDEXES_DOCUMENTATION.md).

## [Unreleased]

### Added

#### Documentation
- Added Line Operating Rates Management documentation in `README.md`, `API.md`, and `CHANGELOG.md` (page features, API endpoints, delta comparison behaviour).
- Added a complete `scripts/` catalog in `README.md` and marked all current scripts as official project components.
- Documented each script by purpose group (setup/maintenance, import/backfill, mapping/analysis) and added operational safety notes.
- Added FX rates documentation in `README.md` and `API.md`, including matrix behavior, Budget semantics (`month = 0`), import aliases, and endpoint payload/response examples.
- Added admin access-permissions documentation in `README.md` and `API.md` (matrix behavior, endpoints, and page-level permission model).
- Updated BOM docs to clarify that material `100.00%` validation is applied to non-surfactant materials only.
- Documented BOM Save WIP/Load WIP surfactant persistence behavior.

#### BOM Calculator and Recipe Edit/Clone
- Percentage composition validation now excludes `Surfactant` rows from the required `100.00%` total:
  - backend create/update validation (`POST /api/bom/records`, `PUT /api/bom/records/:id`)
  - Recipe Edit/Clone editor live total and save-time validation
- Calculation Results percentage denominator is normalized to minimum batch size without surfactants.
- Save WIP / Load WIP now reliably restores surfactant rows including concentration state used by calculations.
- Recipe submission email routing now resolves approvers by recipe region (`CZ`, `EG`, `RSA`) and returns diagnostic fields (`emailSent`, `emailReason`).
- Submission email routing now falls back to env recipients even when recipe line cannot be mapped to a known region.
- BOM Calculator and Recipe Edit/Clone save feedback now displays submission email diagnostics (`emailSent`, `emailReason`) in UI.
- New BOM saves and Recipe Edit/Clone copies now receive server-assigned PD IDs from a contiguous series starting at `10000`.
- The PD ID allocator reuses gaps from Admin-deleted recipes and ignores legacy recipe PD IDs below `10000`.
- BOM Calculator PD ID field is now display-only; users no longer enter PD ID manually for new recipes.
- Recipe Edit/Clone grid now shows immutable `Created` timestamp next to `Author` and `Updated`.
- Recipe Edit/Clone rows now include an Admin-only `Delete` action; deleting a recipe also frees its PD ID for reuse.
- Recipe decision emails to authors now omit SAP ID from subject/body and omit Recipe ID from the email body.
- Recipe Edit/Clone detail popup now closes automatically after successful Save/Copy.
- User-facing identifier wording is standardized to `PD ID` (replacing legacy label variants) across UI labels, export headers, and email bodies/subjects.

#### Audit Logs
- Improved Audit Logs table header contrast in Admin Access Management for better readability.
- BOM record audit details now include `PD ID` so creation/clone/update/approval actions show recipe identifier context directly in Details.
- Audit Logs details now also show record context fields (`Record`, `Source`, `New`, `Action`, `Decision`) when present.

#### Admin Access Management
- Added backend page-level permission model with `page:<page-key>:read` / `page:<page-key>:modify` tokens.
- Added matrix marker token `page:matrix:configured`; when present on a group, matrix permissions are authoritative for that group.
- Added `GET /api/admin/access-permissions/matrix` for admin overview/edit of per-group page permissions.
- Added `PUT /api/admin/groups/:id/access-permissions` to persist per-group page permission matrix updates.
- Added `GET /api/admin/recipe-approval-region-matrix` and `PUT /api/admin/recipe-approval-region-matrix` for regional recipe approval assignments.
- Added `GET /api/auth/me/access-permissions` for frontend authorization based on effective user permissions.
- Updated Admin Access UI with Access Permissions checkbox matrix (Read/Modify per page, per group) including:
  - row-level Save action
  - Save All action for changed groups
  - tooltips explaining page-level Read/Modify scope
  - visual indicator for unsaved changes
- Matrix refresh now stays aligned with group lifecycle changes (create/delete) and includes pre-filled existing effective rights.
- Added Recipe Approval Region matrix UI allowing multi-region assignment of users from `Admin` and `Recipe Approvals` groups.

#### Line Operating Rates Management
- New frontend page `/line-rates` (`src/frontend/line-rates-management.html`) for managing annual operating rates per production line.
- Rate categories split into hourly group (Energy, Wages, Maintenance, Other Costs, SGA & Overhead) and per-ton group (Cores, Packaging, Pallets).
- Transposed matrix layout: production lines displayed as columns, rate categories as rows.
- All numeric values displayed as integers (no decimal places).
- Summary section below table showing total hourly and per-ton rates in line currency and USD; USD conversion uses the last available monthly FX rate in the selected year (12 → 1).
- **Single Year View** toolbar section: year selector, Load Year button, Export CSV, Export Excel.
- **Year Comparison (Δ)** toolbar section:
  - Separate Base Year and Compare To selectors; default pre-fill to `(currentYear − 1) → currentYear`.
  - **Display as** toggle: Absolute (Δ) or Percent (%).
  - Load Delta button fetches both years in parallel and computes per-cell delta (`toYear − fromYear`).
  - Delta cells are colour-coded: green (`+`) for increases, red (`−`) for decreases.
  - Percent mode: relative change rounded to one decimal; base-zero cells display `n/a`.
  - Delta summary rows adapt label and formatting to the selected display mode.
  - Switching Display as while delta data is loaded re-renders immediately without re-fetching.
- Export in delta mode produces CSV or XLSX named `line-rates-delta-<from>-to-<to>.[csv/xlsx]`; percent-mode files add `-pct` infix.
- Import support (admin / `rm_prices:manage` permission): CSV or XLSX file for a given year with optional overwrite; backed by `POST /api/line-rates/import`.
- New backend API endpoints:
  - `GET /api/line-rates/years` — list years with data.
  - `GET /api/line-rates/:year` — rate rows for a given year.
  - `POST /api/line-rates/import` — import annual rate matrix.

#### FX Rates Management
- New `GET /api/fx-rates-matrix/:year` endpoint returns a yearly FX matrix with Budget + months 1..12 for all discovered currency combinations.
- Missing FX pairs in the matrix are auto-resolved by priority: direct rate, inverse rate, then derived cross-currency path.
- Budget values support direct import (`Month = budget`) and fallback derivation from the first available month in the selected year.
- Matrix output excludes self-pairs (`Currency1 == Currency2`).
- FX import normalization supports additional pair alias fields, including `FX_ccy`.

#### RM Prices Page — Filters and Export
- **Status filter**: Dropdown (All / Priced / Fallback / Missing) on the RM Prices page filters the loaded sheet in-place; exports (CSV, Excel, Missing) respect the current filter selection
- **Material name search**: Text input on the RM Prices page filters visible rows by material name as you type (case-insensitive substring match); works in combination with the status filter
- **Export Sheet CSV / Export Sheet Excel**: Two new toolbar buttons on the RM Prices page export the currently visible (filtered) sheet as a CSV file or an XLSX file via SheetJS; exported columns: plant, year, month, category, material_list_key, material_name, status, price (2 dp), currency, source, origin_month, missing flag

#### Delete Material Globally
- New `DELETE /api/rm-prices/materials` endpoint removes a material from all database tables in a single transaction: `bom_dropdown_list_items`, `rm_prices`, `rm_polymer_formulas`, `rm_plant_materials`, `bom_record_materials`, and `bom_records` (where this material is the main raw material)
- Availability Matrix page now shows per-table deletion detail in the status message after a successful delete (e.g. `RM prices: 12 | Plant materials: 3 | ...`)

#### Unified 2 Decimal Place Display for Prices and Costs
- All raw material price values are displayed and exported to exactly 2 decimal places across the entire application: RM Prices page (table and edit input), BOM Calculator dropdown labels, costing dashboard (aggregated table, detail sections, modal), legacy costing overview, and backend CSV export (`/api/export/costs`)
- A shared `formatAmount(value)` helper is used in `app.js`, `script.js`, and the export handler in `server.js`

#### Raw Material Price Management Module
- New frontend page `/rm-prices` for monthly plant-specific raw material pricing (CZ, EG, ZA)
- New SQLite-backed backend module `src/backend/rm-prices.js` with runtime-safe table initialization
- New tables:
  - `rm_prices` (manual and index-calculated monthly prices)
  - `rm_polymer_formulas` (polymer index to price formula mapping)
  - `rm_plant_materials` (material availability by plant)
- New API endpoints for monthly sheets, current-for-line lookup, manual upsert, JSON import, polymer recalculation, formula CRUD, plant-material availability updates, and adding new materials
- New permission model for write operations: group permission `rm_prices:manage` (admins still allowed via `user:manage`)
- Dashboard now includes `Raw Material Prices` navigation button

#### Material Availability Matrix
- New frontend page `/rm-prices/availability` with material-by-plant checkbox matrix
- Bulk actions added: Select Visible / Clear Visible
- Unchecked combinations are treated as unavailable and excluded from missing-price checks

#### BOM Calculator Plant-Aware Material Pricing and Availability
- Material options now display inline price labels in dropdowns after line selection
- Material and surfactant dropdowns are filtered by plant availability inferred from selected line
- When line changes to another plant and selected material is not available:
  - selected material is cleared
  - row is highlighted in red (`material-unavailable-row`)
  - warning banner guides user to choose replacements
- Reset row now also clears availability warning/highlight state

#### BOM Recipe Browser
- New page `/bom-recipe-browser` listing all saved BOM recipes
- Table columns: PD ID, Customer, Line, Customer BW (g/m²), Author, Created Date
- Search by PD ID, Customer, or Line
- Click any row to open a detail modal with all fields and the formula materials table
- Detail modal includes Basic Information, Process Parameters, Product Specifications, and Formula Materials sections

#### BOM Author Tracking
- `author` TEXT column added to `bom_records` table (runtime migration, safe to apply to existing databases)
- Author is auto-populated from the authenticated user's display name on every save
- Visible in Recipe Browser list and detail modal; clients do not supply this field

#### BOM PD ID Validation
- Persisted PD IDs remain numeric-only values
- New and cloned recipes no longer rely on user-entered PD ID; the server assigns the next available numeric PD ID automatically
- Existing recipe PD IDs remain immutable during Edit mode

#### BOM Mandatory Field Validation Gate
- Calculate BOM now validates all 22 mandatory fields before running any calculations
- Missing field names are listed in an alert so users can identify what is incomplete
- Same 22-field list is also enforced in Save BOM Record
- Mandatory (red) fields: Customer, Market Segment, Application, S/SMS, Mono/Bico, Structure, Main RawMat, Bonding, Bico Ratio, Treatment, Color, Customer BW, Belt BW, MB grams, Line, Belt Speed, Siko %, Repro %, Max usable width, Usable width, Edge trim %, Minimum batch size
- PD ID remains an optional (yellow) field with numeric-format validation only

#### BOM Calculator Updates
- **BOM recipe persistence to SQLite**
  - Added `bom_records` table for full saved BOM snapshots
  - Added `bom_record_materials` table for Calculation Results material percentages
  - Added authenticated endpoints:
    - `POST /api/bom/records`
    - `GET /api/bom/records`
    - `GET /api/bom/records/:id`
    - `PUT /api/bom/records/:id`
  - Save flow now stores:
    - Description values (including hidden SAP ID)
    - Calculation Results material composition percentages
    - Minimum batch size + unit
    - Commentary notes
    - Beam Configuration per-column matrix is intentionally not persisted in this flow

- **BOM list migration to database-backed storage**
  - Customer list moved from `customer-list.json` to `bom_customers`
  - Description and material dropdown lists moved from Excel runtime reads to:
    - `bom_dropdown_lists`
    - `bom_dropdown_list_items`
  - Added list APIs:
    - `GET/PUT /api/bom/customers`
    - `GET /api/bom/lists`
    - `GET/PUT /api/bom/description-lists`
  - Added fallback seed sources for customers (Sources.xlsx + product data) when legacy JSON is missing

- **List editing and ordering enhancements**
  - Added in-page list editor modal for editable description lists
  - Kept Line as read-only list
  - Applied alphabetical sorting to server and client list rendering
  - `n.a.` variants are always displayed last
  - Renaming an existing shared Customer or editable Description list value now also propagates to matching historical `bom_records` fields, so Recipe Browser filters and existing saved recipes stay consistent with the shared list

- **Save UX improvements**
  - Added `Save BOM Record` action to toolbar and below Calculation Results
  - Save actions appear after successful BOM calculation
  - Added save-preview modal summary
  - Updated preview fields: show `S/SMS` and `Customer BW` (instead of `Structure`)
  - Added mandatory red-field validation before saving recipe to DB

- **Scrap percentage formula simplified**: Removed "Changeover Loss" field
  - Total Scrap now calculated as: Edge trim + Web loss + Other scrap
  - Users can incorporate changeover losses into "Other scrap" field
- **Width unit clarification**: Updated field labels from "(%)" to "(m)" for width measurements
  - "Max usable width (brutto, m)"
  - "Usable width (netto, m)"

#### Polymer Index Features
- **Line Chart Visualization** (`Show Chart` button on `/polymer-indexes`)
  - Interactive chart displays index trends over selected year range
  - Checkboxes to select/deselect index series in real-time
  - "Select All" / "Deselect All" quick controls
  - Chart updates instantly as users toggle indexes
  
- **Mid Value Auto-Calculation**
  - Mid variant is now computed as (Min + Max) / 2 when both Min and Max exist for a date
  - Direct Mid writes are rejected and auto-computed instead
  - Import endpoint skips Mid rows (auto-calculated on Min/Max import)
  - Backend endpoint `POST /api/admin/polymer-indexes/recalculate-mid` for one-time backfill
  
- **Admin Data Operations**
  - `DELETE /api/admin/polymer-indexes/data/all` endpoint to clear all historical values
  - Red "Clear All Data" button with two-step confirmation (dialog + text prompt)
  - Audit logging for destructive operations
  
- **Large Import Support**
  - JSON payload limit increased to 10 MB
  - Supports bulk imports of 2000+ rows without row-count cap
  - Flexible CSV/Excel column header matching

- **UI/UX Improvements**
  - Sticky table headers (both rows stay visible while scrolling)
  - Header calculation based on actual rendered height, supporting cross-browser consistency
  - Window resize handler to maintain sticky positioning

### Changed
- BOM form field behavior and layout updates:
  - Moved Belt Speed to follow Line
  - Moved Treatment and Color after Main RawMat
  - Swapped scrap field roles:
    - Web loss is now calculated/read-only
    - Edge trim is now manual input
  - S Beams and M Beams now auto-fill from line defaults but can be manually reduced (with max clamp)
- Removed `SAP ID (similar material)` from the BOM form and data handling
- Polymer index data model now enforces single-write semantics: Min/Max writes trigger Mid auto-calculation
- Import behavior updated to skip Mid rows and auto-calculate based on Min/Max pairs
- Index metadata (unit, currency, publish_weekday) properly populated in weekly data aggregation

### Fixed
- BOM record save stability improvements:
  - Hardened parent/child insert logic for `bom_records` and `bom_record_materials`
  - Added stronger error handling and diagnostics in save endpoint
- Beam Configuration Reset button now clears cell background colors (blue/red) in addition to clearing field values
- Documentation consistency fixes:
  - Removed obsolete reference to `INDEX_VARIANT_IMPLEMENTATION.md`
  - Corrected database path references to `data/mini_erp.db`
- Sticky header gap/overlap issue in Historical Data by Week table
- Missing header metadata (unit, currency) in weekly data API response
- Mid value field visibility in admin UI based on data state
- FX import results rendering no longer crashes when a result item does not contain a `status` field

## [Prior Versions]

See [POLYMER_INDEXES_DOCUMENTATION.md](POLYMER_INDEXES_DOCUMENTATION.md) for earlier polymer-index implementation history.

---

## Documentation Map

**Quick Links:**
- [README.md](README.md) — Project overview, quick start, key features
- [API.md](API.md) — Complete API endpoint reference
- [POLYMER_INDEXES_DOCUMENTATION.md](POLYMER_INDEXES_DOCUMENTATION.md) — Polymer index workflows, data model, UI features
- [DEPLOYMENT.md](DEPLOYMENT.md) — Local and production deployment instructions
- [CHANGELOG.md](CHANGELOG.md) — This file; recent changes and feature additions
