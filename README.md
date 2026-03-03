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
cd mini-erp-node
npm install                      # Install dependencies
node scripts/setup.js           # Create test admin user
npm start                       # Start server
# Visit: http://localhost:3000/
```

You'll be redirected to login. **Test Credentials**:
- Email: `testuser@pfnonwovens.com`
- Password: `TestPass123`

After login, you'll access:
- **Dashboard** (`/dashboard`) - Cost analysis and filtering
- **BOM Calculator** (`/bom-calculator`) - Product composition design
- **Products** (`/products`) - Edit product definitions

---

## 🔐 User Authentication (Phase 1 Complete ✅)

**Features**:
- SQLite database (file-based, zero configuration)
- JWT tokens (48-hour sessions)
- Bcryptjs password hashing (pure JavaScript, Azure-compatible)
- Role-based access control (4 roles: Admin, Analyst, Engineer, Viewer)
- Audit logging of all auth events
- **Login restricted to @pfnonwovens.com email accounts**
- **Login requires at least one group assignment**
- **Newly created/approved users are auto-assigned to "General Access" when no group is specified**
- **Login page with frontend authentication flow**
- **Protected routes** requiring valid JWT tokens
- **Logout functionality** on all protected pages

**Protected Routes**:
| Route | Purpose | Auth Required |
|-------|---------|---------------|
| `/` | Login page | No |
| `/dashboard` | Main cost analysis dashboard | Yes |
| `/bom-calculator` | BOM design tool | Yes |
| `/products` | Product data editor | Yes |

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
 - **Line Parameters & Width**: Line_parameters.xlsx provides line width, configuration, beams, and throughput limits; width and adjusted effective width are auto-calculated. **Adjusted effective width (m)** = SB - effective width (m) - 0.1
 - **Throughput Calculations**: SB Throughput (kg/h/m/beam) and MB Throughput (kg/h/m/beam) calculated from Belt BW, MB grams, Belt Speed, and S/M Beams; **Total Throughput (kg/h)** = (SB Throughput × S Beams × Adjusted effective width) + (MB Throughput × M Beams × Adjusted effective width), displayed as whole numbers
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
├── package.json                 # Dependencies, build scripts
├── data/                        # Excel source files + SQLite database
│   ├── FX_rates.xlsx           # Currency conversion rates
│   ├── Lines.xlsx              # Manufacturing line costs
│   ├── Products.xlsx           # Product recipes (BOMs)
│   ├── RawMat_prices.xlsx      # Material prices by country/currency
│   └── mini_erp.db             # SQLite database (auto-created, contains users & audit logs)
├── scripts/
│   └── setup.js                # Initialize database with test user
├── src/
│   ├── backend/
│   │   ├── auth.js             # Authentication system (SQLite, JWT, RBAC, audit logging)
│   │   ├── fx.js               # FX rate loading & conversion
│   │   ├── lines.js            # Manufacturing line data loader
│   │   ├── materials.js        # Raw material prices loader
│   │   ├── products.js         # Product BOM loader
│   │   ├── products-editor.js  # Product editing & duplication logic
│   │   └── costing.js          # Main cost calculation engine
│   └── frontend/
│       ├── login.html          # Login page (entry point)
│       ├── auth.js             # Token management & auth helpers
│       ├── index.html          # Main dashboard UI (/dashboard)
│       ├── bom-calculator.html # BOM design tool (/bom-calculator)
│       ├── products-editor.html # Product editor (/products)
│       ├── styles.css          # Responsive styling
│       └── script.js           # Frontend logic & API calls
├── server.js                    # Express server with auth routes
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

### Azure Deployment
When deploying to Azure App Service (Windows):
1. Push to GitHub - Azure auto-deploys via GitHub Actions
2. If you see HTTP 500 errors on first deployment, use the **Kudu workaround** (see Troubleshooting section)
3. The workaround ensures sqlite3 native binaries are compiled for Azure's runtime environment
4. After running the Kudu commands, restart the app and it will work without errors

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

## Completed Enhancements

- [x] User authentication & role-based access (Phase 1 ✅)
- [x] SQLite backend for user management + audit logs
- [x] Login page with JWT token handling
- [x] Protected frontend routes requiring authentication
- [x] Logout functionality across all pages
- [x] Bcryptjs for password hashing (Azure-compatible)
- [x] Access request system for @pfnonwovens.com employees (Phase 2 ✅)
- [x] Group management foundation for future group-based permissions
- [x] Admin dashboard for managing user access requests
- [x] Approval workflow with automatic user account creation

## Phase 2: Access Request & Group Management (NEW)

### Features
- **Public Access Request Form** (`/request-access.html`): Employees with @pfnonwovels.com email can request access
- **Admin Dashboard** (`/admin-access.html`): Admins can review, approve, and deny access requests
- **Group System**: Foundation for group-based permissions (ready for corporate migration)
- **Automatic Account Creation**: When an admin approves a request, a user account is automatically created with a temporary password

### How It Works

**For Employees Requesting Access:**
1. Visit `/request-access.html` (linked from login page)
2. Enter @pfnonwovels.com email address, full name, and optional reason
3. Submit request and wait for admin approval

**For Admins Managing Requests:**
1. Visit `/admin-access.html` (button visible on dashboard for admin users)
2. Use the three-tab interface to manage access, groups, and audit logs

### Admin Dashboard Features

The admin dashboard includes three main tabs:

#### 1. Access Requests Tab
- **View Requests**: See all pending, approved, and denied access requests
- **Approve Access**: Approve requests to automatically create user accounts with temporary passwords
- **Deny Access**: Deny requests with optional reason
- **Filter by Status**: Filter requests by pending/approved/denied status
- **Request Details**: View requester email, full name, reason, and timestamps

#### 2. Groups Tab
- **View Groups**: See all user groups and their members
- **Group Details**: View group name, description, permissions, and member count
- **Edit Users**: Modify user email, name, and password directly from group view
- **Remove Users**: Remove users from specific groups
- **Member Management**: See complete list of group members with their details

#### 3. Audit Logs Tab
- **Comprehensive Filtering:**
  - **User Filter**: Dropdown to filter by specific user
  - **Action Filter**: Filter by action type (login, logout, password_change, etc.)
  - **Date Range**: Filter logs by start and end date
  - **Text Search**: Search across log details with debounced input (300ms delay)
- **Export to CSV**: Download filtered audit logs for offline analysis and compliance reporting
- **Real-time Statistics**: View:
  - Total log count
  - Unique users tracked
  - Number of unique action types
  - Timestamp of last activity
- **Refresh Button**: Manually reload audit logs
- **Detailed Log View**: See user email, action, details, IP address, user agent, and timestamp

**Audit Log Actions Tracked:**
- `login` - Successful login
- `logout` - User logout
- `login_failed` - Failed login attempt
- `password_change` - Password changed
- `password_reset_request` - Password reset requested
- `user_created` - New user account created
- `user_updated` - User information updated
- `user_deleted` - User account deleted
- `access_request_approved` - Access request approved
- `access_request_denied` - Access request denied

### Database Schema

**access_requests** table:
- `id` - Unique request ID
- `email` - Requester email
- `full_name` - Requester name
- `reason` - Optional reason for request
- `status` - pending/approved/denied
- `requested_at` - Request timestamp
- `reviewed_by` - Admin user ID (if approved/denied)
- `reviewed_at` - Approval/denial timestamp
- `notes` - Approval/denial notes

**groups** table:
- `id` - Group ID
- `name` - Group name (e.g., "Product Managers")
- `description` - Group description
- `permissions` - JSON array of group permissions
- `created_at` - Creation timestamp

**user_groups** table:
- Maps users to groups for group-based access control

### API Endpoints

#### Public (No Auth Required)
- `POST /api/auth/request-access` - Submit access request
  - Body: `{ email, fullName, reason }`
  - Returns: Request ID and status

#### Admin Only (Requires `user:manage` permission)
- `GET /api/admin/access-requests` - List access requests
  - Query params: `status` (pending/approved/denied, optional)
  - Returns: Array of requests

- `POST /api/admin/access-requests/:id/approve` - Approve request
  - Returns: User ID, email, temporary password

- `POST /api/admin/access-requests/:id/deny` - Deny request
  - Body: `{ reason }` (optional)
  - Returns: Confirmation

- `GET /api/admin/groups` - List all groups
  - Returns: Array of groups

- `POST /api/admin/groups` - Create group
  - Body: `{ name, description, permissions }`
  - Returns: Created group

- `POST /api/admin/users` - Create new user account
  - Body: `{ email, name, password, role }`
  - Returns: User ID

- `PUT /api/admin/users/:userId` - Update user information
  - Body: `{ email, name, password }` (password optional)
  - Returns: Success confirmation

- `DELETE /api/admin/users/:userId/groups/:groupId` - Remove user from group
  - Returns: Success confirmation

- `GET /api/admin/audit-logs` - Get audit logs with filtering
  - Query params: `userId`, `action`, `startDate`, `endDate`, `search`
  - Returns: Array of audit log entries

- `GET /api/admin/audit-logs/stats` - Get audit log statistics
  - Returns: Total logs, unique users, unique actions, last activity

**Note:** Full API documentation available in [API.md](API.md)

## Future Enhancements

- [ ] Azure Entra ID integration (Phase 3 - Corporate Migration)
- [ ] SSO login for corporate domain accounts
- [ ] Auto-sync groups from corporate directory
- [ ] Database backend for product/costing data (instead of Excel files)
- [ ] Data upload/refresh endpoints for Excel files
- [ ] Multi-language support
- [ ] Advanced filtering (date ranges, cost ranges)
- [ ] Data visualization (charts, graphs)
- [ ] Historical cost tracking
- [ ] Scenario modeling (what-if analysis)
- [ ] Material sourcing optimization
- [ ] Line efficiency metrics
- [ ] Email notifications for cost alerts
- [ ] Email notifications for access request approval/denial

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

### Azure: HTTP 500 errors or "node_sqlite3.node is not a valid Win32 application"
**Cause**: Native sqlite3 modules compiled locally don't match Azure's Windows runtime architecture.

**Solution** (Kudu Console Workaround):
1. Go to Azure Portal → Your App Service → Advanced Tools (Kudu) → Debug Console
2. Navigate to `D:\home\site\wwwroot`
3. Run these commands:
   ```powershell
   npm cache clean --force
   npm install
   npm rebuild sqlite3
   ```
4. Restart the app service
5. The website should now work without 500 errors

**Why this works**: The rebuild command recompiles sqlite3 native binaries in Azure's specific Node.js environment, ensuring compatibility.

### Change Password Button Not Working

**Symptoms**: The "Change Password" button on the dashboard is not responding to clicks.

**Root Causes & Fixes**:

1. **Missing Modal CSS Styling**
   - **Problem**: The modal HTML had `style="display: none"` but there was no `.modal` CSS class styling to properly format it as an overlay modal.
   - **Solution**: Added complete modal CSS to `styles.css` with fixed positioning, z-index: 1000, and semi-transparent overlay (rgba(0,0,0,0.5)).

2. **Event Listener Timing Issues**
   - **Problem**: Event listeners were being attached before the DOM was fully loaded, which could cause the click handler to fail.
   - **Solution**: Refactored JavaScript to use `DOMContentLoaded` event, wrapped event listener setup in `setupEventListeners()` function, added null checks for all DOM elements before attaching listeners, and used `readyState` check to handle already-loaded pages.

3. **Missing Error Handling**
   - **Problem**: The original code didn't handle cases where elements might not exist or fetch calls might fail gracefully.
   - **Solution**: Added null checks for all `document.getElementById()` calls, try-catch blocks around fetch operations, and more descriptive error messages.

**Verification**:
- Run `node test-change-password-button.js` to verify functionality
- Check that modal opens with proper overlay styling
- Verify form validation works (passwords must match, ≥6 chars)
- Confirm password change succeeds and audit log is created

## Recent Implementation Notes

### Admin Page Compact Layout

**File Modified**: `src/frontend/admin-access.html`

**Changes Made**:
- Reduced `.admin-container` padding: 20px → 12px
- Reduced `.header` padding: 20px → 12px, margin-bottom: 30px → 15px
- Reduced `.tabs` gap: 10px → 8px, margin-bottom: 20px → 12px
- Reduced `.tab` padding: 10px 20px → 8px 15px, font-size: 16px → 14px
- Reduced `.tab-content` padding: 20px → 12px
- Reduced `.alert` padding: 15px → 10px, margin-bottom: 20px → 12px
- Reduced table cells padding: 12px → 8px
- Reduced `.form-group` margin: 15px → 10px
- Reduced `.groups-container` gap: 20px → 12px
- Reduced `.group-card` padding: 20px → 12px
- Reduced `.group-header` margin-bottom: 20px → 12px, padding-bottom: 15px → 10px

**Result**: Admin page is now ~30% more compact while maintaining proper spacing and readability.

### Change Password Feature

**Frontend Changes** (`src/frontend/index.html`):
1. Added "Change Password" button to dashboard header (purple/blue #667eea)
2. Added password change modal with Current Password, New Password, and Confirm Password fields
3. Added JavaScript functions: `openChangePasswordModal()`, `closeChangePasswordModal()`, `confirmChangePassword()`
4. Validates passwords match and are ≥6 characters
5. Button visibility: Shows for all authenticated users EXCEPT those in "Test Group"

**Backend Changes**:
1. `server.js`: Added `POST /api/auth/change-password` endpoint (requires authMiddleware)
2. `src/backend/auth.js`: Added `changePassword()` function that:
   - Retrieves user by ID
   - Verifies current password against stored hash
   - Hashes new password and updates database
   - Logs audit event
   - Returns success/error response

**Test Results**: All tests passing ✅
- Admin login works
- Rejects wrong current password (401)
- Changes password with correct current password
- Old password invalidated after change
- New password allows login
- Password can be changed multiple times
- Modal opens and closes properly
- Form validation works
- Group membership check works

**Files Modified**:
1. `src/frontend/admin-access.html` - Compact CSS spacing
2. `src/frontend/index.html` - Change Password button, modal, logic
3. `src/frontend/styles.css` - Modal CSS styling
4. `server.js` - New POST /api/auth/change-password endpoint
5. `src/backend/auth.js` - New changePassword() function

## Support

For issues or questions:
1. Check debug endpoints for data validation
2. Review browser console for JavaScript errors
3. Check server logs for backend errors
4. Verify Excel file format and data integrity

## License

Proprietary - PFNonwovens LLC

---

**Last Updated:** March 2, 2026
**Version:** 1.0
