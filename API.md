# API Reference

Complete API documentation for the Manufacturing Cost ERP system.

## Base URL

```
http://localhost:3000/api
```

## Authentication

All authentication endpoints are available publicly. Costing endpoints are currently unprotected but can be secured by adding `auth.authMiddleware` to require authentication.

### Authentication Endpoints

#### POST /auth/login
Authenticate user with email and password.

**Request Body:**
```json
{
  "email": "testuser@pfnonwovens.com",
  "password": "TestPass123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjA1MGZkMzg5NzViZDJiYzJlMTAzY2ZiYmYzNmY3NmM3IiwiZW1haWwiOiJ0ZXN0dXNlckBwZm5vbndvdmVucy5jb20iLCJuYW1lIjoiVGVzdCBVc2VyIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzcyNDU4MjY2LCJleHAiOjE3NzI2MzEwNjZ9.6E0Bh6gvgWzHgy9TEbSbDRRlQnmSu4lxrbCHhjsPApk",
  "user": {
    "id": "050fd38975bd2bc2e103cfbbf36f76c7",
    "email": "testuser@pfnonwovens.com",
    "name": "Test User",
    "role": "admin"
  }
}
```

**Error Response (401):**
```json
{
  "success": false,
  "error": "Invalid password"
}
```

**Status Codes:**
- 200 OK
- 401 Unauthorized (invalid credentials)
- 500 Internal Server Error

---

#### GET /auth/me
Get current authenticated user profile.

**Required Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200):**
```json
{
  "id": "050fd38975bd2bc2e103cfbbf36f76c7",
  "email": "testuser@pfnonwovens.com",
  "name": "Test User",
  "role": "admin",
  "is_active": 1,
  "created_at": "2026-03-02 13:13:29"
}
```

**Status Codes:**
- 200 OK
- 401 Unauthorized (missing or invalid token)
- 404 Not Found (token valid but user deleted)
- 500 Internal Server Error

---

#### POST /auth/logout
Logout current user and record audit log.

**Required Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200):**
```json
{
  "success": true
}
```

**Status Codes:**
- 200 OK
- 401 Unauthorized (missing or invalid token)
- 500 Internal Server Error

---

## Using the API with Authentication

## Response Format

All endpoints return JSON responses with the following general structure:

### Success Response
```json
{
  "data": {...},
  "status": "ok",
  "timestamp": "2026-02-04T12:00:00.000Z"
}
```

### Error Response
```json
{
  "error": "Error message",
  "details": "Additional context",
  "status": "error"
}
```

---

## Health & Metadata

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-04T12:00:00.000Z"
}
```

**Status Codes:** 200 OK

---

### GET /metadata
Get available filters and metadata for all product specifications.

**Description:**
Returns lists of available filter values for SAP ID, PFN ID, Customer, Market Segment, Application, S/SMS, Bonding, Basis Weight, Slit Width, Treatment, Author, Line ID, Country, and supported currencies for autocomplete suggestions.

**Response:**
```json
{
  "sapIds": ["SAP001", "SAP002", "SAP003"],
  "pfnIds": ["PFN001", "PFN002", "PFN003"],
  "customers": ["Customer A", "Customer B"],
  "marketSegments": ["Hygiene", "Medical", "Industrial"],
  "applications": ["Diapers", "Wipes", "Medical"],
  "smsOptions": ["100% SMS", "SMS/Spunbond", "Spunbond"],
  "bondings": ["Thermal", "Chemical", "Mechanical"],
  "basisWeights": [15, 20, 25, 30, 40, 50],
  "slitWidths": [100, 200, 300, 400],
  "treatments": ["Corona", "Flame", "None"],
  "authors": ["John", "Jane", "Smith"],
  "lineIds": ["Line_CZ_1", "Line_ZA_1"],
  "countries": ["CZ", "ZA"],
  "currencies": ["USD", "CZK", "EUR", "ZAR", "GBP"],
  "totalProducts": 150
}
```

**Note:** Basis Weight and Slit Width are sorted numerically (3 before 10).

**Status Codes:** 
- 200 OK
- 500 Internal Server Error

**Note:** The frontend uses multi-select dropdowns and will send repeated query parameters when multiple filter values are selected (for example: `?sapId=SAP1&sapId=SAP2`). The server accepts repeated parameters and will match any of the provided values.

---

## Costing Endpoints

### GET /costs
Main costing calculation endpoint.

**Description:**
Calculates material, process, and total costs for products based on filters and display currency. All costs are computed from source data and converted to the specified currency.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `currency` | string | No | USD | Display currency (USD, CZK, EUR, ZAR, GBP) |
| `productId` | string | No | null | Filter by product ID (exact match) |
| `lineId` | string | No | null | Filter by line ID (exact match) |
| `country` | string | No | null | Filter by country code (exact match) |

**Example Requests:**

```bash
# Get all costs in USD
GET /costs

# Get costs for specific product
GET /costs?productId=PROD001

# Get costs for product on specific line in EUR
GET /costs?productId=PROD001&lineId=Line_CZ_1&currency=EUR

# Get all costs for a country
GET /costs?country=CZ&currency=CZK
```

**Response:**
```json
[
  {
    "productId": "PROD001",
    "lineId": "Line_CZ_1",
    "country": "CZ",
    "materialCostGross": 25.60,
    "materialCostNet": 27.85,
    "processCost": 8.45,
    "totalCost": 36.30,
    "currency": "CZK",
    "fxRates": {
      "USDUSD": 1,
      "USDCZK": 22.5,
      ...
    },
    "details": {
      "materials": [
        {
          "material": "PP Resin",
          "basePct": 0.85,
          "effectivePct": 0.8755,
          "priceUSD": 1.25,
          "baseCost": 1.0625,
          "finalCost": 1.0944
        }
      ],
      "baseMaterialCostPerKgUSD": 1.062,
      "finalMaterialCostPerKgUSD": 1.094,
      "overconsumptionImpact": 0.032,
      "netMaterialCostPerKgUSD": 1.237,
      "sikoCostUSD": 0.45,
      "scrapFraction": 0.08,
      "grossYield": 0.92,
      "process": {
        "hoursPerTon": 1.087,
        "hourlyCostUSD": 150.00,
        "perTonCostUSD": 500.00,
        "hourlyCostContribution": 0.176,
        "perTonCostContribution": 0.375,
        "hourlyComponents": {
          "energyUSD": 45.00,
          "wagesUSD": 80.00,
          "maintenanceUSD": 20.00,
          "otherUSD": 5.00,
          "sgnaUSD": 0.00
        },
        "perTonComponents": {
          "coresUSD": 200.00,
          "packagingUSD": 250.00,
          "palletsUSD": 50.00
        }
      }
    }
  }
]
```

**Status Codes:**
- 200 OK
- 400 Bad Request (invalid currency)
- 500 Internal Server Error

**Multi-value filters:** Most filter parameters may be provided multiple times to request several values, e.g. `/costs?sapId=SAP1&sapId=SAP2&country=CZ`.

**Notes:**
- `materialCostGross` = Material cost before accounting for yield
- `materialCostNet` = Material cost including scrap handling
- `materialCost` = Alias for `materialCostNet` (for backward compatibility)
- All detailed values are calculated and available for reference
- FX rates are included for debugging and client-side conversion

---

## Product Editor Endpoints

### GET /products/editable
Get all products in editable format, optionally filtered by search term.

**Description:**
Returns all products with complete BOM (Bill of Materials) information in a format suitable for editing. Each product includes its row index for update operations.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `search` | string | No | "" | Filter products by search term (searches SAP ID, PFN ID, customer, market segment, application) |

**Example Requests:**

```bash
# Get all products
GET /products/editable

# Search for products
GET /products/editable?search=hygiene
GET /products/editable?search=SAP001
```

**Response:**
```json
{
  "count": 5,
  "products": [
    {
      "rowIndex": 0,
      "sapId": "SAP001",
      "pfnId": "PFN001",
      "customer": "Customer A",
      "marketSegment": "Hygiene",
      "application": "Diapers",
      "s_sms": "100% SMS",
      "bonding": "Thermal",
      "basisWeight": "25",
      "slitWidth": "200",
      "treatment": "Corona",
      "author": "John",
      "lineId": "Line1",
      "country": "CZ",
      "grossYield": "0.92",
      "throughput": "250",
      "overconsumption": "0.05",
      "bom": [
        {
          "material": "PE Resin",
          "percentage": 0.85,
          "baseField": "PE1",
          "percentField": "PE1%"
        },
        {
          "material": "SB1",
          "percentage": 0.12,
          "baseField": "SB1",
          "percentField": "Adj. SB1%"
        },
        {
          "material": "Siko (recycled scrap replacement)",
          "percentage": 0.02,
          "percentField": "Siko%"
        }
      ]
    }
  ]
}
```

**Status Codes:**
- 200 OK
- 500 Internal Server Error

---

### POST /products/update
Update a specific product record and save to Excel file.

**Description:**
Updates a product at the specified row index with new values. Supports updating all product fields and BOM. Automatically calculates Adj. SB1% field based on SB1%, Siko%, and Repro%.

**Request Body:**

```json
{
  "rowIndex": 0,
  "updates": {
    "sapId": "SAP001",
    "pfnId": "PFN001-REV2",
    "customer": "Updated Customer",
    "marketSegment": "Medical",
    "application": "Face Masks",
    "s_sms": "SMS/Spunbond",
    "bonding": "Chemical",
    "basisWeight": "30",
    "slitWidth": "200",
    "treatment": "Flame",
    "author": "Jane",
    "lineId": "Line2",
    "country": "ZA",
    "grossYield": "0.95",
    "throughput": "300",
    "overconsumption": "0.03",
    "bom": [
      {
        "material": "PE Resin",
        "percentage": 0.80,
        "baseField": "PE1",
        "percentField": "PE1%"
      },
      {
        "material": "SB1",
        "percentage": 0.15,
        "baseField": "SB1",
        "percentField": "SB1%"
      },
      {
        "material": "Siko (recycled scrap replacement)",
        "percentage": 0.03,
        "percentField": "Siko%"
      },
      {
        "material": "Repro (regranulated waste replacement)",
        "percentage": 0.02,
        "percentField": "Repro%"
      }
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Product updated successfully",
  "rowIndex": 0
}
```

**Status Codes:**
- 200 OK
- 400 Bad Request (missing rowIndex or updates)
- 500 Internal Server Error

**Notes:**
- `rowIndex` is the zero-based row index in the spreadsheet (row 2 = index 0, row 3 = index 1, etc.)
- All fields are optional in updates object
- BOM is completely replaced with new items if provided
- Adj. SB1% is automatically calculated as: max(0, SB1% - Siko% - Repro%)

---

### POST /products/duplicate
Create a copy of an existing product with modified SAP ID and PFN ID.

**Description:**
Duplicates a product by copying all data from the source row to a new row. The new row has SAP ID and PFN ID set to "TBD" for manual assignment. All other fields are copied unchanged.

**Request Body:**

```json
{
  "rowIndex": 0
}
```

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/products/duplicate \
  -H "Content-Type: application/json" \
  -d '{"rowIndex": 0}'
```

**Response:**
```json
{
  "success": true,
  "newRowIndex": 42
}
```

**Status Codes:**
- 200 OK
- 400 Bad Request (missing rowIndex)
- 500 Internal Server Error (product not found)

**Notes:**
- The duplicated row is appended to the end of the products list
- Returns `newRowIndex` which can be used to immediately update the new product
- SAP ID and PFN ID should be updated via the `/products/update` endpoint before using the duplicate

---

## Export Endpoints

### GET /export/costs
Export cost data as CSV.

**Description:**
Returns a CSV file with cost data matching the specified filters. Useful for further analysis in spreadsheet software.

**Query Parameters:**
Same as `/costs` endpoint.

**Example Requests:**

```bash
# Export all costs
GET /export/costs

# Export costs for specific country in local currency
GET /export/costs?country=CZ&currency=CZK
```

**Response:**
```
Product ID,Line,Country,Material Cost (Net),Process Cost,Total Cost,Currency
PROD001,Line_CZ_1,CZ,1.237,0.375,1.612,CZK
PROD002,Line_CZ_1,CZ,1.456,0.375,1.831,CZK
PROD003,Line_ZA_1,ZA,2.145,0.420,2.565,CZK
```

**HTTP Headers:**
```
Content-Type: text/csv
Content-Disposition: attachment; filename="costs-2026-02-04.csv"
```

**Status Codes:**
- 200 OK
- 404 Not Found (no data matching filters)
- 500 Internal Server Error

---

## Debug Endpoints

Debug endpoints return raw parsed data for troubleshooting.

### GET /debug/products
Get all parsed product data.

**Response:**
```json
[
  {
    "productId": "PROD001",
    "lineId": "Line_CZ_1",
    "country": "CZ",
    "grossYield": 0.92,
    "throughput": 850,
    "overconsumption": 0.025,
    "productionTime": 1.207,
    "materials": [
      {
        "material": "PP Resin",
        "pct": 0.85
      },
      {
        "material": "Pigment",
        "pct": 0.12
      }
    ]
  }
]
```

---

### GET /debug/lines
Get all parsed manufacturing line data.

**Response:**
```json
{
  "Line_CZ_1": {
    "lineId": "Line_CZ_1",
    "country": "CZ",
    "currency": "CZK",
    "energy": 2010,
    "wages": 1600,
    "maintenance": 400,
    "other_costs": 100,
    "sga_and_overhead": 0,
    "cores": 4000,
    "packaging": 5000,
    "pallets": 1000
  }
}
```

---

### GET /debug/materials
Get all parsed material prices and Siko costs.

**Response:**
```json
{
  "materials": {
    "PP Resin__CZ": {
      "material": "PP Resin",
      "country": "CZ",
      "priceUSD": 1.25
    },
    "Pigment__CZ": {
      "material": "Pigment",
      "country": "CZ",
      "priceUSD": 8.50
    }
  },
  "siko": {
    "CZ": 0.45,
    "ZA": 0.38
  }
}
```

---

### GET /debug/fx
Get all parsed FX rates.

**Response:**
```json
{
  "EURUSD": 1.1050,
  "USDEUR": 0.9050,
  "CZUSD": 0.0444,
  "USDCZK": 22.5,
  "ZARUSD": 0.0554,
  "USDZAR": 18.0456,
  "GBPUSD": 1.27,
  "USDGBP": 0.787,
  ...
}
```

---

## Error Handling

### Common Error Responses

**Invalid Currency:**
```json
{
  "error": "Failed to compute costs",
  "details": "Unknown currency: XYZ"
}
```

**No Data Found:**
```json
[
]
```
Returns empty array if no products match filters.

**Server Error:**
```json
{
  "error": "Internal server error",
  "details": "Error message from exception"
}
```

---

## Rate Limiting

Currently, no rate limiting is implemented. Future versions may include:
- Per-IP request throttling
- Per-user quota limits
- Burst request handling

---

## Pagination

Currently not implemented. All results are returned in a single response. For large datasets, consider:
- Using filters to reduce result set
- Implementing pagination in future versions
- Using CSV export for offline analysis

---

## Currency Support

Supported currencies:
- `USD` - US Dollar
- `CZK` - Czech Koruna
- `EUR` - Euro
- `ZAR` - South African Rand
- `GBP` - British Pound

Additional currencies can be added by updating FX_rates.xlsx with new pairs.

---

## Performance Tips

1. **Use filters** to reduce computation time and data transfer
2. **Use specific currency** to avoid unnecessary conversions
3. **Cache metadata** on client side for filter suggestions
4. **Batch requests** using appropriate query parameters
5. **Export CSV** for large result sets instead of fetching JSON

---

## Versioning

Current API Version: **1.0**

Future versions will include:
- Versioning headers (Accept-Version)
- Deprecation notices
- Migration guides

---

## Examples

### Example 1: Get All CZ Products in CZK

```bash
curl "http://localhost:3000/api/costs?country=CZ&currency=CZK"
```

### Example 2: Get Specific Product Across All Lines

```bash
curl "http://localhost:3000/api/costs?productId=PROD001&currency=EUR"
```

### Example 3: Export Product Data

```bash
curl "http://localhost:3000/api/export/costs?productId=PROD001" \
  --output costs.csv
```

### Example 4: Metadata for UI

```bash
curl "http://localhost:3000/api/metadata"
```

### Example 5: Debugging Material Prices

```bash
curl "http://localhost:3000/api/debug/materials" | jq '.materials'
```

### Example 6: Authentication Flow

**Step 1: Login**
```powershell
$response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
  -Method POST `
  -Body '{"email":"testuser@pfnonwovens.com","password":"TestPass123"}' `
  -ContentType 'application/json'

$token = $response.token
```

**Step 2: Use token for authenticated requests**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/me" `
  -Method GET `
  -Headers @{"Authorization"="Bearer $token"}
```

**Step 3: Logout**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/logout" `
  -Method POST `
  -Headers @{"Authorization"="Bearer $token"}
```

---

**API Version:** 1.0  
**Last Updated:** February 4, 2026
