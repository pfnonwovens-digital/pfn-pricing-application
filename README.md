# Manufacturing Cost ERP System

A comprehensive Node.js + Express + Vanilla JavaScript ERP system for analyzing and managing manufacturing costs across multiple production lines, currencies, and product compositions.

## 📚 Documentation

**All project documentation is consolidated into 3 files:**

| File | Purpose | Contains |
|------|---------|----------|
| [README.md](README.md) | **Main documentation** | Features, quick start, setup, file structure, costing formulas, troubleshooting |
| [DEPLOYMENT.md](DEPLOYMENT.md) | **Production setup** | Local dev, Azure deployment (3 methods), environment config, security, monitoring, backup |
| [API.md](API.md) | **API reference** | All endpoints (auth, costing, products, export), request/response formats, examples |

---

## ⚡ Quick Start (5 minutes)

```bash
npm install                      # Install dependencies
node scripts/setup.js           # Create test admin user
npm start                       # Start server
# Visit: http://localhost:3000/login.html
```

**Test Credentials**:
- Email: `testuser@pfnonwovens.com`
- Password: `TestPass123`

---

## 🔐 User Authentication (Phase 1 Complete ✅)

**Features**:
- SQLite database (file-based, zero configuration)
- JWT tokens (48-hour sessions)
- Bcrypt password hashing
- Role-based access control (4 roles: Admin, Analyst, Engineer, Viewer)
- Audit logging of all auth events
- Login page + frontend auth helper

**API Endpoints**:
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/auth/login` | No | Login with email/password |
| GET | `/api/auth/me` | Yes | Get current user profile |
| POST | `/api/auth/logout` | Yes | Logout (audit logged) |

📖 See [API.md](API.md) for complete API reference and examples.

---

## Features

### Core Functionality
 - **Currency Selector**: View costs in USD, CZK, EUR, ZAR (the server still supports additional currencies via FX rates)
 - **Multi-select Filters**: All filter fields are multi-select dropdowns — open and Ctrl+click to choose multiple values
 - **Top Horizontal Scroller**: Aggregated table includes a synchronized top horizontal scrollbar for easier navigation
 - **Local Company Logo**: Header logos are loaded from `/data/PFN_logo.png` (served by the server)
 - **CSV Export**: Download filtered cost data with all specifications

### Product Editor
 - **Edit Products**: Modify existing product definitions including BOM (Bill of Materials), specifications, and production parameters
 - **Search Products**: Quickly find products by SAP ID, PFN ID, customer name, market segment, or application
 - **Copy Products**: Duplicate product definitions to create variants or new products based on existing templates
 - **BOM Management**: Edit material compositions with automatic calculations for adjusted SB1%, recycled scrap (Siko), and regranulated waste (Repro)

### Analysis & Reporting
 - **Clear Filters**: Reset all filters to default. `Clear Filters` also resets the currency selector to `USD` and the view mode to the aggregated view.

### BOM Calculator
 - **Description Section**: Comprehensive product metadata with dropdown fields (Customer, Market Segment, Application, S/SMS, Mono/Bico, Structure, Main RawMat, Bonding, Bico Ratio A/D, Treatment, Color, Cores, Line) plus keyboard input fields (PD ID, SAP ID) and performance parameters (Slit Width, Length, Roll Diameter)
 - **Dynamic Field Population**: Dropdown fields automatically populated from Sources.xlsx Lists sheet, preserving source file order
 - **Line Parameters & Width**: Line_parameters.xlsx provides line width, configuration, beams, and throughput limits; width and adjusted effective width are auto-calculated
 - **Throughput Calculations**: SB Throughput (kg/h/m/beam) and MB Throughput (kg/h/m/beam) calculated from Belt BW, MB grams, Belt Speed, and S/M Beams; Total Throughput (kg/h) = (SB × S Beams × Adjusted width) + (MB × M Beams × Adjusted width), displayed as whole numbers
- **Production Time**: Production Time (hrs/t) = 1000 / (Gross Yield × Throughput); Batch Production Time (including overconsumption) = (1 + overconsumption) × minimum batch size (tons) × production time, displayed as days/hours/minutes
 - **Required Field Highlighting**: Visual feedback system with light red backgrounds for mandatory fields, light yellow for optional fields, and light blue when completed; includes field color legend
 - **Beam Configuration**: 8-head production setup with GSM and BICO (A/B component) ratio inputs, integrated BICO ratio splitting
 - **Material Recycling**: Siko (scrap %) and Repro (regranulate %) controls that reduce first Spunbond polymer consumption and display as separate line items (Recyclate and Regranulate)
 - **Surfactant Management**: Dynamic row-based entry with delete buttons, responsive grid layout (3 per row on wide screens)
 - **Production Target**: Tonnage entry for cost calculations across all materials
 - **Visual Feedback**: Light blue background highlighting for populated input fields in Beam Configuration, automatic color toggle on entry/clear
 - **Advanced Sorting**: BOM results sorted by material category and consumption volume for readability

## File Structure

```
├── package.json                 # Dependencies
├── data/                        # Excel source files
│   ├── FX_rates.xlsx           # Currency conversion rates
│   ├── Lines.xlsx              # Manufacturing line costs
│   ├── Products.xlsx           # Product recipes (BOMs)
│   └── RawMat_prices.xlsx      # Material prices by country/currency
├── src/
│   ├── backend/
│   │   ├── fx.js               # FX rate loading & conversion
│   │   ├── lines.js            # Manufacturing line data loader
│   │   ├── materials.js        # Raw material prices loader
│   │   ├── products.js         # Product BOM loader
│   │   ├── products-editor.js  # Product editing & duplication logic
│   │   └── costing.js          # Main cost calculation engine
│   └── frontend/
│       ├── index.html          # Main dashboard UI
│       ├── products-editor.html # Product editor interface
│       ├── styles.css          # Responsive styling
│       └── script.js           # Frontend logic & API calls
└── README.md                    # This file
```

## Excel Data Format

### FX_rates.xlsx
Columns: `CurrencyPair`, `FX_Rate`
- Example: `EURUSD = 1.10` (1 EUR = 1.10 USD)
- System automatically generates reverse pairs

### Lines.xlsx
Columns (first row = field names, subsequent columns = line IDs):
- `Country` - Country of operation
- `Currency` - Cost currency
- `Energy` - Energy cost per hour
- `Wages` - Labor cost per hour
- `Maintenance` - Maintenance cost per hour
- `Other_Costs` - Other hourly costs
- `SGA_and_Overhead` - SGA & overhead per hour
- `Cores` - Per-ton cores cost
- `Packaging` - Per-ton packaging cost
- `Pallets` - Per-ton pallets cost

### Products.xlsx
Columns:
- `SAP ID` - SAP system product identifier
- `PFN ID` - PFN product identifier
- `Customer` - Customer name
- `Market segment` - Market segment classification
- `Application` - Product application
- `S/SMS` - Spunbond/SMS material type
- `Bonding` - Bonding type (thermal, chemical, etc.)
- `Basis weight` - Basis weight in g/m² (numeric - sorted numerically)
- `Slit width` - Slit width (numeric - sorted numerically)
- `Treatment` - Surface treatment type
- `Author` - Product author/creator
- `Line` - Production line ID
- `Country` - Production country
- `Gross Yield` - Production yield (0-1, e.g., 0.92 for 92%)
- `Throughput` - kg per hour (throughput speed)
- `Overconsumption` - Material overconsumption % (0-1, e.g., 0.05 for 5%)
- Material columns: `[MaterialName]` + `[MaterialName]%`
- `SB1`, `Adj. SB1%` - Special base material 1 handling
- `Siko%` - Scrap material percentage
- `Repro%` - Repro material percentage

### RawMat_prices.xlsx
Columns: `Country`, `Raw Material`, `Currency`, `Price`
- `Price` is cost per kilogram
- Special handling for "Siko" (scrap) material

## Installation & Setup

### Prerequisites
- Node.js 14+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Ensure Excel files are in ./data/ directory
# - FX_rates.xlsx
# - Lines.xlsx
# - Products.xlsx
# - RawMat_prices.xlsx

# Start server
npm start
# Server runs on http://localhost:3000
```

### Alternative: Using Environment Variables

```bash
# Custom port
PORT=8080 npm start
```

## API Endpoints

### Main Endpoints

#### `GET /api/health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-04T12:00:00.000Z"
}
```

#### `GET /api/metadata`
Get available filters and options for all product specifications.

**Response:**
```json
{
  "sapIds": ["SAP001", "SAP002", ...],
  "pfnIds": ["PFN001", "PFN002", ...],
  "customers": ["Customer A", "Customer B", ...],
  "marketSegments": ["Hygiene", "Medical", ...],
  "applications": ["Application1", "Application2", ...],
  "smsOptions": ["100% SMS", "SMS/Spunbond", ...],
  "bondings": ["Thermal", "Chemical", ...],
  "basisWeights": [15, 20, 25, 30, 40, 50],
  "slitWidths": [100, 200, 300, 400],
  "treatments": ["Corona", "None", ...],
  "authors": ["John", "Jane", ...],
  "lineIds": ["Line1", "Line2", ...],
  "countries": ["CZ", "ZA", ...],
  "currencies": ["USD", "CZK", "EUR", "ZAR", "GBP"],
  "totalProducts": 150
}
```

#### `GET /api/costs`
Main costing endpoint with advanced filtering support.

**Query Parameters:**
- `currency` (optional, default: USD) - Display currency
- `sapId` (optional) - Filter by SAP ID
- `pfnId` (optional) - Filter by PFN ID
- `customer` (optional) - Filter by customer
- `marketSegment` (optional) - Filter by market segment
- `application` (optional) - Filter by application
- `s_sms` (optional) - Filter by S/SMS type
- `bonding` (optional) - Filter by bonding type
- `basisWeight` (optional) - Filter by basis weight
- `slitWidth` (optional) - Filter by slit width
- `treatment` (optional) - Filter by treatment
- `author` (optional) - Filter by author
- `lineId` (optional) - Filter by line
- `country` (optional) - Filter by country

**Example:**
```
/api/costs?currency=EUR&customer=CustomerA&marketSegment=Hygiene&lineId=Line1
```

**Response:**
```json
[
  {
    "sapId": "SAP001",
    "pfnId": "PFN001",
    "customer": "Customer A",
    "marketSegment": "Hygiene",
    "application": "Diapers",
    "s_sms": "100% SMS",
    "bonding": "Thermal",
    "basisWeight": 25,
    "slitWidth": 200,
    "treatment": "Corona",
    "author": "John",
    "lineId": "Line1",
    "country": "CZ",
    "grossYield": 0.92,
    "throughput": 250,
    "overconsumption": 0.05,
    "materialCostGross": 10.25,
    "materialCostNet": 11.15,
    "processCost": 3.45,
    "totalCost": 14.60,
    "currency": "EUR",
    "details": {
      "materials": [...],
      "process": {...},
      ...
    }
  }
]
```

#### `GET /api/export/costs`
Export costs as CSV file.

**Query Parameters:** Same as `/api/costs`

**Response:** CSV file download

### Debug Endpoints

#### `GET /api/debug/products`
Returns parsed product data with BOM.

#### `GET /api/debug/lines`
Returns parsed manufacturing line data.

#### `GET /api/debug/materials`
Returns parsed material prices and Siko costs.

#### `GET /api/debug/fx`
Returns parsed FX rates (including reverse pairs).

## Costing Formulas

### Material Cost (per kg)

1. **Gross Material Cost:**
   ```
   Gross = Σ(material_percentage × material_price_in_base_currency)
   ```

2. **With Overconsumption:**
   ```
   With OC = Σ(material_percentage × (1 + overconsumption) × price)
   ```

3. **Net Material Cost (accounting for yield & scrap):**
   ```
   Net = (Gross / Gross_Yield) + ((1 - Gross_Yield) / Gross_Yield) × Siko_Cost
   ```

### Process Cost (per kg)

1. **Hours per Ton:**
   ```
   Hours_per_Ton = (1000 / Gross_Yield) / Throughput
   ```

2. **Hourly Cost Contribution:**
   ```
   Hourly_Contribution = (Hourly_Cost × Hours_per_Ton) / 1000
   ```

3. **Per-Ton Cost Contribution:**
   ```
   Per_Ton_Contribution = Per_Ton_Cost / 1000
   ```

4. **Total Process Cost:**
   ```
   Process_Cost = Hourly_Contribution + Per_Ton_Contribution
   ```

### Total Cost

```
Total = Material_Cost_Net + Process_Cost
```

All calculations are done in USD internally, then converted to the display currency using FX rates.

## Frontend Usage

### Dashboard Features

1. **Currency Selection**: Change display currency at top
2. **View Mode Toggle**: Switch between Aggregated and Detailed views
3. **Filters**:
   - **Product ID**: Type or select from suggestions
   - **Line ID**: Type or select from suggestions
   - **Country**: Type or select from suggestions
4. **Load Button**: Refresh data with current filters
5. **Clear Filters**: Reset all filters to default
6. **Export CSV**: Download filtered data
7. **Product Editor Link**: Quick access to product editing interface

### Product Editor

The Product Editor (`/src/frontend/products-editor.html`) provides a dedicated interface for managing product definitions:

1. **Search Products**: Use the search box to find products by keyword
2. **Edit Products**: Click the Edit button to modify:
   - Product specifications (SAP ID, PFN ID, customer, etc.)
   - Production parameters (Gross Yield, Throughput, Overconsumption)
   - Bill of Materials (BOM) including material percentages
3. **Copy Products**: Click the Copy button to duplicate a product
   - The new product will have SAP ID and PFN ID set to "TBD"
   - You can then edit the copied product and assign new IDs
4. **Save Changes**: Click Save to write changes to the Excel file

**Accessing the Product Editor:**
- Click "Product Editor" link in the main dashboard
- Direct URL: `http://localhost:3000/src/frontend/products-editor.html`

### Aggregated View
- Summary table with one row per product-line combination
- Click any row to open detailed breakdown modal
- Summary statistics at top (record count, averages)

### Detailed View
- Expanded sections for each product
- Full material composition table
- Process cost component breakdown
- All values in selected currency

### Detail Modal
- Click any row in aggregated view to open
- Shows complete cost breakdown
- Material-level pricing details
- Process component costs
- Click ✕ or outside modal to close

## Development

### Adding New Features

#### New Filter Type
1. Add field to Products.xlsx
2. Update `products.js` to parse field
3. Update filter form in `index.html`
4. Update `loadMetadata()` endpoint in `server.js`

#### New Cost Component
1. Add to Lines.xlsx
2. Parse in `lines.js`
3. Update costing logic in `costing.js`
4. Update detail display in `script.js`

#### New Currency
1. Add rate pair to FX_rates.xlsx (e.g., GBPUSD)
2. System automatically handles reverse pair

### Testing

```bash
# Check server health
curl http://localhost:3000/api/health

# View metadata
curl http://localhost:3000/api/metadata

# Get all costs
curl http://localhost:3000/api/costs

# Get costs for specific product
curl http://localhost:3000/api/costs?productId=PROD001

# View debug data
curl http://localhost:3000/api/debug/products
curl http://localhost:3000/api/debug/fx
```

## Performance Notes

- **Data Loading**: Excel files are loaded into memory on each API call
  - For large datasets, consider caching
- **Calculations**: All cost calculations are done in-memory
- **FX Conversion**: Supports up to 3-leg conversions (e.g., CZK → USD → EUR)
- **Scaling**: Current implementation supports 1000+ products efficiently

## Future Enhancements

- [ ] Database backend (instead of Excel files)
- [ ] Data upload/refresh endpoints
- [ ] Multi-language support
- [ ] Advanced filtering (date ranges, cost ranges)
- [ ] Data visualization (charts, graphs)
- [ ] User authentication & role-based access
- [ ] Historical cost tracking
- [ ] Scenario modeling (what-if analysis)
- [ ] Material sourcing optimization
- [ ] Line efficiency metrics

## Troubleshooting

### "Cannot find Excel file"
- Ensure all Excel files are in `./data/` directory
- Check file names match exactly (case-sensitive on Linux/Mac)

### "Unknown currency"
- Add FX rate to FX_rates.xlsx with format like `GBPUSD`
- Restart server to reload FX data

### "No data found"
- Check filters are correct
- Verify product IDs exist in Products.xlsx
- Use debug endpoints to inspect raw data

### CSS not loading
- Clear browser cache (Ctrl+Shift+Delete)
- Ensure styles.css is served correctly

## Support

For issues or questions:
1. Check debug endpoints for data validation
2. Review browser console for JavaScript errors
3. Check server logs for backend errors
4. Verify Excel file format and data integrity

## License

Proprietary - PFNonwovens LLC

---

**Last Updated:** February 4, 2026
**Version:** 1.0
