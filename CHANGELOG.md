# Changelog

All notable changes to the Mini ERP system are documented here. For current feature and API documentation, see [README.md](README.md), [API.md](API.md), and [POLYMER_INDEXES_DOCUMENTATION.md](POLYMER_INDEXES_DOCUMENTATION.md).

## [Unreleased]

### Added

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
- Polymer index data model now enforces single-write semantics: Min/Max writes trigger Mid auto-calculation
- Import behavior updated to skip Mid rows and auto-calculate based on Min/Max pairs
- Index metadata (unit, currency, publish_weekday) properly populated in weekly data aggregation

### Fixed
- Sticky header gap/overlap issue in Historical Data by Week table
- Missing header metadata (unit, currency) in weekly data API response
- Mid value field visibility in admin UI based on data state

## [Prior Versions]

See [POLYMER_INDEXES_DOCUMENTATION.md](POLYMER_INDEXES_DOCUMENTATION.md) and [INDEX_VARIANT_IMPLEMENTATION.md](INDEX_VARIANT_IMPLEMENTATION.md) for earlier implementation history.

---

## Documentation Map

**Quick Links:**
- [README.md](README.md) — Project overview, quick start, key features
- [API.md](API.md) — Complete API endpoint reference
- [POLYMER_INDEXES_DOCUMENTATION.md](POLYMER_INDEXES_DOCUMENTATION.md) — Polymer index workflows, data model, UI features
- [DEPLOYMENT.md](DEPLOYMENT.md) — Local and production deployment instructions
- [CHANGELOG.md](CHANGELOG.md) — This file; recent changes and feature additions
