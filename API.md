# API Reference

Base URL:

- `http://localhost:3000/api`

## Authentication Model

- Authentication uses JWT bearer tokens.
- Most `/api/admin/*` and polymer endpoints require:
  - Valid token (`Authorization: Bearer <token>`)
  - `user:manage` permission
- Raw material pricing endpoints require a valid token.
- Raw material pricing write endpoints require either:
  - role permission `user:manage` (admin-level), or
  - group permission `rm_prices:manage`
- FX rates endpoints require a valid token.
- Page-level permissions can be configured per group using token keys:
  - `page:<page-key>:read`
  - `page:<page-key>:modify`
- If a group has matrix marker `page:matrix:configured`, page access is evaluated from matrix permissions for that group.
- Admin matrix endpoints require `user:manage`.

## Health

- `GET /api/health`
  - Returns service status and timestamp

## Auth Endpoints

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/auth/me/groups`
- `GET /api/auth/me/access-permissions`
- `POST /api/auth/logout`
- `POST /api/auth/change-password`
- `POST /api/auth/request-access`

## Admin Access Requests

- `GET /api/admin/access-requests`
- `POST /api/admin/access-requests/:id/approve`
- `POST /api/admin/access-requests/:id/deny`

## Admin Groups

- `GET /api/admin/groups`
- `POST /api/admin/groups`
- `PUT /api/admin/groups/:id` (supports optional `permissions` array)
- `DELETE /api/admin/groups/:id`
- `GET /api/admin/groups/:id/users`

## Admin Access Permissions Matrix

- `GET /api/admin/access-permissions/matrix`
  - Returns:
    - `pages`: configured page metadata shown in admin matrix
    - `matrix`: one row per group with effective `pagePermissions` (`read`/`modify`)
- `PUT /api/admin/groups/:id/access-permissions`
  - Updates a group's page access matrix and persists normalized permission tokens.
  - Request body:

```json
{
  "pagePermissions": {
    "dashboard": { "read": true, "modify": false },
    "fx-rates": { "read": true, "modify": true }
  }
}
```

## Admin Recipe Approval Region Matrix

- `GET /api/admin/recipe-approval-region-matrix`
  - Returns approver candidates and current region assignments.
  - Candidate users are dynamically resolved as active users in either `Admin` or `Recipe Approvals` groups.
  - Response shape:

```json
{
  "regions": ["CZ", "EG", "RSA"],
  "matrix": [
    {
      "userId": "12",
      "name": "Jane Doe",
      "email": "jane@pfnonwovens.com",
      "groups": ["Admin"],
      "regions": { "CZ": true, "EG": false, "RSA": true }
    }
  ]
}
```

- `PUT /api/admin/recipe-approval-region-matrix`
  - Persists region assignments for candidate users.
  - Request body:

```json
{
  "matrix": [
    {
      "userId": "12",
      "regions": { "CZ": true, "EG": false, "RSA": true }
    }
  ]
}
```

  - A user can be assigned to multiple regions.
  - Non-candidate users are ignored for safety.

## Auth Access Permission Response

`GET /api/auth/me/access-permissions`

- Returns effective per-user page rights merged from assigned groups.
- Response example:

```json
{
  "pages": {
    "dashboard": { "read": true, "modify": false },
    "fx-rates": { "read": true, "modify": true },
    "polymer-indexes": { "read": true, "modify": false }
  }
}
```

## Admin Users and Audit

- `GET /api/admin/users`
- `POST /api/admin/users`
- `PUT /api/admin/users/:userId`
- `DELETE /api/admin/users/:userId/groups/:groupId`
- `GET /api/admin/audit-logs`
- `GET /api/admin/audit-logs/stats`

## Polymer Index Endpoints

- `GET /api/admin/polymer-indexes`
- `POST /api/admin/polymer-indexes`
- `PUT /api/admin/polymer-indexes/:id`
- `DELETE /api/admin/polymer-indexes/:id` — **Admin only** delete a single index definition
- `GET /api/admin/polymer-indexes/:id/values` — retrieve historical values for an index
- `POST /api/admin/polymer-indexes/:id/values` — write or update a single value (Mid is treated as a derived value)
- `POST /api/admin/polymer-indexes/import` — bulk import values from JSON rows
- `DELETE /api/admin/polymer-indexes/data/all` — **Admin only** delete all historical values (not index definitions)
- `POST /api/admin/polymer-indexes/recalculate-mid` — recalculate derived Mid values from existing Min/Max pairs (backfill utility)
- `GET /api/admin/polymer-indexes/reminders/due` — list pending publication reminders
- `GET /api/admin/polymer-indexes/data/by-week?startYear=YYYY&endYear=YYYY` — retrieve values grouped by ISO week

### Polymer Data Management

#### Clear All Historical Data

`DELETE /api/admin/polymer-indexes/data/all`

Deletes all values in `polymer_index_values` while preserving index definitions. Useful for bulk re-import.

Response:

```json
{
  "success": true,
  "deletedCount": 1250
}
```

#### Recalculate Derived Mid Values (Backfill)

`POST /api/admin/polymer-indexes/recalculate-mid`

Recalculates all Mid index values as the average of (Min + Max) / 2 for each shared date. Use as a controlled backfill operation after bulk import when needed.

**Note:** Mid is a derived value auto-calculated from Min/Max writes; this endpoint is intended for historical data backfill.

Response:

```json
{
  "success": true,
  "groupsProcessed": 8,
  "groupsSkipped": 1,
  "totalDatesProcessed": 480,
  "midCreated": 0,
  "midUpdated": 480
}
```

#### Polymer Import Payload

`POST /api/admin/polymer-indexes/import`

Request body:

```json
{
  "rows": [
    {
      "Index Name": "Platts PP",
      "Variant": "Min",
      "Value Date": "2026-02-25",
      "Value": 1.318
    }
  ]
}
```

Accepted header aliases are flexible (case and spacing tolerant), but preferred columns are:

- `Index Name` — base name (e.g., "Platts PP")
- `Variant` — "Min", "Mid", or "Max" (Mid is a derived value and will be auto-calculated when Min/Max exist)
- `Value Date` — ISO date format YYYY-MM-DD
- `Value` — numeric value (null or zero values are rejected)

**Max payload:** 10 MB JSON

Response shape:

```json
{
  "success": true,
  "result": {
    "totalRows": 48,
    "insertedValues": 20,
    "updatedValues": 28,
    "errors": []
  }
}
```

**Behavior:**
- Existing rows (same index + date) are updated
- New rows are inserted
- Mid rows are skipped on import (derived Mid is computed when Min/Max are written)
- Blank/zero values are rejected

## Product and BOM Endpoints

- `GET /api/bom/lists`
- `GET /api/bom/customers`
- `PUT /api/bom/customers`
- `GET /api/bom/description-lists`
- `PUT /api/bom/description-lists/:listKey`
- `POST /api/bom/records` (auth required) — saves record; auto-populates `author` from the authenticated user
- `GET /api/bom/records` (auth required)
- `GET /api/bom/records/:id` (auth required)
- `POST /api/bom/cost-preview` (auth required)
- `GET /api/bom/recipe-summary/metadata` (auth required)
- `GET /api/bom/recipe-summary` (auth required)
- `GET /api/bom/recipe-summary/export` (auth required)
- `PUT /api/bom/records/:id` (auth required)
- `DELETE /api/bom/records/:id` (auth required, Admin group only)
- `GET /api/bom/approvals/pending` (auth required)
- `GET /api/bom/approvals/:id` (auth required)
- `POST /api/bom/approvals/:id/action` (auth required)

### BOM Recipe Persistence

### BOM Shared List Behavior

- `PUT /api/bom/customers`
  - Saves the shared Customer list
  - Existing values cannot be deleted, only renamed or appended
  - Renaming an existing customer also updates matching historical `bom_records.customer` values so Recipe Browser and saved recipe summaries reflect the edited name

- `PUT /api/bom/description-lists/:listKey`
  - Saves an editable shared description list such as Market Segment, Application, S/SMS, Bonding, Treatment, or Color
  - Existing values cannot be deleted, only renamed or appended
  - Renaming an existing value also updates the corresponding persisted text column in historical `bom_records`, keeping Recipe Browser filters and existing recipes aligned with the shared list

- `POST /api/bom/records`
  - Stores a full BOM snapshot in `bom_records` plus material percentages from Calculation Results in `bom_record_materials`
  - The `author` field is auto-populated from the authenticated user's display name; clients do not supply it
  - The server auto-assigns a new numeric `pd_id` for every newly saved or cloned recipe
  - Auto-assigned `pd_id` values start at `10000`, advance by `1`, reuse gaps left by deleted recipes, and ignore legacy recipe IDs below `10000`
  - New records are stored with `recipe_approved = "No"`
  - Optional immutable snapshot can be stored via `calculationSnapshot` in request body (`calculation_snapshot_json` in DB)
  - Server validates that total percentage of non-surfactant materials equals `100.00%` (surfactants are excluded from this check)
  - Submission email recipients are selected by recipe line region (`CZ` / `EG` / `RSA`) from the Admin Recipe Approval Region Matrix
  - If no matrix assignee is found for the region (or region cannot be resolved from line), server uses env fallback list (`RECIPE_APPROVAL_NOTIFY_TO`, `RECIPE_SUBMISSION_NOTIFY_TO`, `APPROVAL_NOTIFY_TO`)
  - Response includes `emailSent` and `emailReason` fields for notification diagnostics
  - Request body includes:
    - `record` object (description fields, throughput/scrap values, minimum batch size + unit, notes)
    - `materials` array (`material_label`, `material_name`, `percentage`)
    - optional `calculationSnapshot` object

- `GET /api/bom/records`
  - Returns saved record list: `id`, `pd_id`, `customer`, `line`, `customer_bw`, `author`, `created_at`, `updated_at`, `created_by`
  - `created_at` is immutable creation timestamp; `updated_at` is refreshed on each edit

- `GET /api/bom/records/:id`
  - Returns one full BOM record including child `materials`

- `PUT /api/bom/records/:id`
  - Updates a saved BOM record and replaces its `materials` rows in a transaction
  - Uses the same non-surfactant `100.00%` percentage validation as create
  - Existing records keep their current `pd_id`; Edit mode does not permit changing an already stored PD ID

- `DELETE /api/bom/records/:id`
  - Deletes the BOM record and its child `bom_record_materials` rows in a transaction
  - Restricted to users who belong to the `Admin` group
  - Deleting a recipe releases its auto-assigned `pd_id` back to the allocator for reuse

### Recipe Approval Endpoints

- `GET /api/bom/approvals/pending`
  - Returns recipes waiting for review (`recipe_approved = "No"`)
  - Includes `pd_id` used by the first `PD ID` column in the Recipe Approval list UI

- `GET /api/bom/approvals/:id`
  - Returns one pending recipe detail with materials and resolved `author_email`

- `POST /api/bom/approvals/:id/action`
  - Applies one of: `approve`, `revise` (Recommend Update), `reject`
  - Comment is required
  - Sends decision email to recipe author and returns diagnostics in response:
    - `result.emailSent`
    - `result.emailReason`

### BOM Recipe Summary Endpoints

- `GET /api/bom/recipe-summary/metadata`
  - Returns filter metadata for recipe summary page:
    - `sapIds`, `pfnIds`, `customers`, `marketSegments`, `applications`, `smsOptions`, `bondings`,
      `basisWeights`, `slitWidths`, `treatments`, `authors`, `overconsumptions`, `lineIds`, `countries`, `currencies`
  - Note: response key `pfnIds` is a backward-compatible API key; values represent PD IDs
  - Customer and description filter values are derived from persisted `bom_records` data, so they reflect shared-list renames after propagation

- `GET /api/bom/recipe-summary`
  - Returns aggregated summary rows including `recipeApproved`, material/process/total cost in selected currency,
    and optional saved snapshot payload when present
  - Supports multi-value filters via query params:
    - `sapId`, `pfnId`, `customer`, `marketSegment`, `application`, `s_sms`, `bonding`,
      `basisWeight`, `slitWidth`, `treatment`, `author`, `lineId`, `country`, `overconsumption`
  - Note: query param `pfnId` is backward-compatible and filters PD ID values

- `GET /api/bom/recipe-summary/export`
  - Exports filtered summary as `csv` (default) or `xlsx`
  - Query params: same filters as summary + `currency` + `format`

- `POST /api/bom/cost-preview`
  - Computes a single record preview using supplied `record` + `materials` and selected `currency`
  - Response: `{ item: ... }`

## Raw Material Price Endpoints

- `GET /api/rm-prices/sheet?year=YYYY&month=M&plant=CZ|EG|ZA` (auth required)
  - Returns plant/month sheet with one row per active plant-material combination
  - Row status:
    - `priced` = exact month price exists
    - `fallback` = latest historical price up to selected month is used
    - `missing` = no price available

- `GET /api/rm-prices/current-for-line?line=<LINE_ID>[&year=YYYY&month=M]` (auth required)
  - Resolves plant from line prefix (`CZ*`, `EG*`, `ZA*`)
  - Returns `price_map` + `rows` used by BOM Calculator for labels and filtering

- `GET /api/rm-prices/formulas` (auth required)
  - Lists polymer pricing formulas (`rm_polymer_formulas`)

- `GET /api/rm-prices/plant-materials` (auth required)
  - Lists plant-material availability rows (`rm_plant_materials`)

- `POST /api/rm-prices` (auth + `rm_prices:manage`)
  - Upsert manual monthly price
  - Body fields: `material_list_key`, `material_name`, `plant`, `year`, `month`, `price`, `currency`

- `POST /api/rm-prices/import` (auth + `rm_prices:manage`)
  - Bulk import/upsert prices from JSON `rows`

- `POST /api/rm-prices/import-non-polymer` (auth + `rm_prices:manage`)
  - Bulk import/upsert prices from JSON `rows` while skipping polymer categories (`list_sb`, `list_mb`)
  - Response includes `skipped_polymer` count

- `POST /api/rm-prices/calculate-polymer` (auth + `rm_prices:manage`)
  - Calculates polymer prices from active formulas and index values for selected period/plant

- `POST /api/rm-prices/roll` (auth + `rm_prices:manage`)
  - Copies raw material prices from a source period to a target period for a given plant
  - Body fields:
    - `from_year`, `from_month` — source period
    - `to_year`, `to_month` — target period
    - `plant` — one of `CZ`, `EG`, `ZA`
    - `material_list_key` *(optional)* — limit roll to one category (e.g. `list_pigment`)
    - `overwrite` *(boolean)* — if `false`, materials already priced in the target period are skipped
  - Response: `{ success, result: { source, target, total_source, copied, skipped_existing } }`

- `POST /api/rm-prices/formulas` (auth + `rm_prices:manage`)
  - Create/update one polymer formula

- `DELETE /api/rm-prices/formulas/:id` (auth + `rm_prices:manage`)
  - Delete one polymer formula by ID

- `PUT /api/rm-prices/plant-materials` (auth + `rm_prices:manage`)
  - Update availability matrix assignments
  - Body: `{ "assignments": [{ "material_list_key", "material_name", "plant", "active" }] }`

- `POST /api/rm-prices/materials/add` (auth + `rm_prices:manage`)
  - Adds material into BOM list and activates selected plants
  - Supports optional surfactant numeric value via `numeric_value`

- `DELETE /api/rm-prices/materials` (auth + `rm_prices:manage`)
  - Permanently deletes a material everywhere in the database (transactional)
  - Body: `{ "material_list_key": "...", "material_name": "..." }`
  - Removes from: `bom_dropdown_list_items`, `rm_prices`, `rm_polymer_formulas`, `rm_plant_materials`, `bom_record_materials`, `bom_records` (records where this is the main raw material)
  - Response includes per-table deleted row counts:
    ```json
    { "success": true, "deleted": { "bom_dropdown_list_items": 1, "rm_prices": 12, "rm_polymer_formulas": 0, "rm_plant_materials": 3, "bom_record_materials": 5, "bom_records_main_raw_mat": 0 } }
    ```

## FX Rates Endpoints

- `GET /api/fx-rates/periods` (auth required)
  - Returns available periods from `fx_rates`
  - Response:
    ```json
    {
      "periods": [
        { "year": 2025, "month": 12 },
        { "year": 2025, "month": 0 }
      ]
    }
    ```
  - Note: `month = 0` represents Budget

- `GET /api/fx-rates/:year/:month` (auth required)
  - Returns stored rows for one period only (no matrix expansion)
  - Response:
    ```json
    {
      "rates": [
        {
          "id": 15,
          "year": 2025,
          "month": 1,
          "currency_pair": "EURUSD",
          "rate": 1.0912,
          "created_at": "2026-01-10 08:00:00",
          "updated_at": "2026-01-10 08:00:00"
        }
      ]
    }
    ```

- `GET /api/fx-rates-matrix/:year` (auth required)
  - Returns a full year matrix with `Budget` plus months `1..12`
  - Matrix is limited to `EUR`, `USD`, `CZK`, and `ZAR`
  - Rows are generated for discovered combinations inside that set
  - Self pairs are excluded (for example `EUR/EUR` is not returned)
  - Rate resolution priority per cell:
    - direct imported pair
    - inverse pair
    - derived cross-currency path
    - for Budget only: first available month fallback (`budget-fallback-mX`)
  - Response:
    ```json
    {
      "year": 2025,
      "months": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      "currencies": ["CZK", "EUR", "USD", "ZAR"],
      "rows": [
        {
          "currency1": "EUR",
          "currency2": "USD",
          "currency_pair": "EURUSD",
          "budget": 1.09,
          "months": {
            "1": 1.0912,
            "2": 1.085,
            "3": null
          },
          "sources": {
            "budget": "budget-fallback-m1",
            "1": "imported",
            "2": "inverse",
            "3": null
          }
        }
      ]
    }
    ```

- `POST /api/fx-rates/import` (auth required)
  - Bulk import JSON rows; periods are grouped and saved into `fx_rates`
  - Body:
    ```json
    {
      "overwrite": false,
      "rows": [
        {
          "Year": 2025,
          "Month": "budget",
          "FX_ccy": "EURUSD",
          "Rate": 1.09
        },
        {
          "Year": 2025,
          "Month": 1,
          "FX_pair": "EURUSD",
          "Rate": 1.0912
        }
      ]
    }
    ```
  - Accepted aliases:
    - Year: `Year`, `year`, `YEAR`
    - Month: `Month`, `month`, `MONTH` (`budget` is accepted and stored as month `0`)
    - Pair: `FX_pair`, `CurrencyPair`, `Pair`, `Currency Pair`, `FX Pair`, `FX_ccy`
    - Rate: `Rate`, `FX_Rate`, `FX Rate`
  - Response:
    ```json
    {
      "success": true,
      "results": [
        {
          "period": "2025-budget",
          "success": true,
          "message": "FX rates saved",
          "inserted": 12
        },
        {
          "period": "2025-01",
          "status": "skipped",
          "message": "Period already exists, skipped to avoid overwrite"
        }
      ]
    }
    ```

- `DELETE /api/fx-rates/:id` (auth required)
  - Deletes one stored FX rate row by `id`
  - Response:
    ```json
    {
      "success": true
    }
    ```

## Line Operating Rates

All endpoints require a valid auth token.

- `GET /api/line-rates/years`
  - Returns all years for which at least one line operating rate record exists.
  - Response: `{ "years": [2025, 2026, ...] }`

- `GET /api/line-rates/:year`
  - Returns all operating rate rows for the given year.
  - Response: `{ "rows": [ { "line_id", "country", "currency", "energy", "wages", "maintenance", "other_costs", "sga_and_overhead", "cores", "packaging", "pallets" }, ... ] }`

- `POST /api/line-rates/import`
  - Imports an annual rate matrix from a raw 2-D array (as parsed from CSV/XLSX).
  - Requires `user:manage` or `rm_prices:manage` permission.
  - Request body:

```json
{
  "year": 2026,
  "raw": [["LineID", "CZ1", ...], ["energy", 1200, ...]],
  "overwrite": false
}
```

  - Response: `{ "result": { "inserted": 8, "updated": 0, "skipped": 2 } }`

## Debug Endpoints

- `GET /api/debug/lines`
- `GET /api/debug/materials`
- `GET /api/debug/fx`

## Frontend Page Routes (non-API)

- `/` — login page
- `/dashboard` — landing page (module navigation hub)
- `/bom-calculator` — BOM calculator
- `/bom-recipe-browser` — saved BOM recipe browser
- `/rm-prices` — raw material monthly price management
- `/rm-prices/availability` — material availability matrix by plant
- `/polymer-indexes` — polymer index manager (displays week-based data, chart, import/export)
- `/line-rates` — line operating rates management (annual matrix, delta comparison, import)
