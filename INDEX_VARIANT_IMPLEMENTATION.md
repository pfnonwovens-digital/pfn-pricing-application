# Index/Variant Implementation Summary

**Status:** Reference only. See canonical documentation below for current behavior.

## Historical Implementation Notes

This file documents the past implementation of index/variant handling. For current features:

- **Feature documentation:** [POLYMER_INDEXES_DOCUMENTATION.md](POLYMER_INDEXES_DOCUMENTATION.md)
- **Recent changes:** [CHANGELOG.md](CHANGELOG.md)

## What Was Implemented (Past)

- Index name and variant are handled as separate UI inputs for manual entry
- Index parsing supports both `Base - Variant` and `Base Variant` formats
- Historical table was redesigned to week-based layout with per-index Date + variants
- Import was hardened with flexible header matching and explicit inserted/updated/error reporting

## Current Behavior (See Canonical Docs)

The implementation has evolved significantly with:

- **Mid auto-calculation:** Mid = (Min + Max) / 2 when Min and Max exist
- **Chart visualization:** Line chart with selectable index series
- **Data operations:** Bulk clear and one-time Mid recalculation
- **Import enhancements:** Support for 10 MB payloads, better error reporting

For all current details, refer to:

- [POLYMER_INDEXES_DOCUMENTATION.md](POLYMER_INDEXES_DOCUMENTATION.md)
- [API.md](API.md)
- [CHANGELOG.md](CHANGELOG.md)
