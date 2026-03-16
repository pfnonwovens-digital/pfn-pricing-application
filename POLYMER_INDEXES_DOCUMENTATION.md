# Polymer Indexes Documentation

## Purpose

The Polymer Indexes module manages index definitions (name/variant/unit/currency/publish day) and historical values, then presents data grouped by ISO week.

## Main UI Flow

1. Create index definitions
2. Import or manually enter values
3. Load historical table by year range

Route:

- `http://localhost:3000/polymer-indexes`

## Index Definition Model

Each variant is stored as its own index record, typically:

- `<Base Name> - Min`
- `<Base Name> - Mid`
- `<Base Name> - Max`

Example:

- `ICIS PP Raffia - Min`
- `ICIS PP Raffia - Mid`
- `ICIS PP Raffia - Max`

## Historical Data Import

Preferred columns in Excel/CSV:

- `Index Name`
- `Variant`
- `Value Date`
- `Value`

Examples:

- `Platts PP`, `Min`, `2026-02-25`, `1.318`
- `ICIS PP Raffia`, `Mid`, `2026-02-27`, `1.2975`

Import behavior:

- Existing row (same index + date) is updated
- New row is inserted
- Blank Value is rejected
- Import returns inserted/updated/error counts

## Manual Entry Behavior

- Index and variant are selected separately in the UI
- Date and numeric value are required
- Save writes or updates one point for that index/date
- **Mid variant:** If you try to enter a Mid value directly and Min/Max exist for the same date, the Mid value is auto-computed as (Min + Max) / 2 and the direct Mid entry is rejected

## Historical Table Behavior

- Rows are ISO week/year (`week/year`)
- Columns are grouped by base index
- Sub-columns include Date + variants (Min/Mid/Max where available)
- Only weeks with at least one non-zero/non-null value are shown
- **Sticky headers:** Both header rows (index names + variant names) remain visible while scrolling vertically
- **Chart button:** Click "Show Chart" to display a line chart of any subset of indexes over the selected year range

## API Endpoints

- `GET /api/admin/polymer-indexes`
- `POST /api/admin/polymer-indexes`
- `PUT /api/admin/polymer-indexes/:id`
- `GET /api/admin/polymer-indexes/:id/values`
- `POST /api/admin/polymer-indexes/:id/values`
- `POST /api/admin/polymer-indexes/import`
- `GET /api/admin/polymer-indexes/reminders/due`
- `GET /api/admin/polymer-indexes/data/by-week`

All endpoints above require authentication and `user:manage` permission.

## Chart Display

- Click **"Show Chart"** on the Historical Data by Week page
- A popup modal displays a line chart of index trends over the selected year range
- Index checkboxes on the left allow you to include/exclude series in real-time
- Use "Select All" / "Deselect All" to quickly toggle visibility
- Chart updates instantly as you click checkboxes
- Chart timeframe always matches the year range selected at the top of the page

## Mid Value Auto-Calculation

The Mid variant is now **automatically calculated** from Min and Max values:

- When Min and Max are both present for a given date, Mid is set to `(Min + Max) / 2`
- Direct Mid writes are rejected if Min/Max already exist for that date
- Import ignores Mid rows; they are recalculated based on imported Min/Max
- Use the **one-time recalculate endpoint** to backfill Mid values after a bulk import

## Data Maintenance

### Clear All Historical Data

- Click the **red "Clear All Data"** button (admin only)
- Confirm twice: a dialog and a text prompt
- Deletes all rows from `polymer_index_values`
- Keeps index definitions intact, allowing full re-import

This is useful for starting fresh with new data or removing outdated entries.

### Manual Database Cleanup

If needed, clear historical values while keeping index definitions:

- Delete rows from `polymer_index_values`
- Keep `polymer_indexes` unchanged
- This allows full re-import without recreating index structure

## Large Imports

- The system supports imports up to **10 MB JSON payload**
- Typical large imports (1000+ rows) should complete within a few seconds
- See [API.md](API.md) for request format and response codes
