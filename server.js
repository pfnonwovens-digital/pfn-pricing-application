const express = require("express");
const path = require("path");
const cors = require("cors");

const { computeCosts } = require("./src/backend/costing");
const { loadProducts } = require("./src/backend/products");
const { loadLines } = require("./src/backend/lines");
const { loadMaterials } = require("./src/backend/materials");
const { loadFxRates } = require("./src/backend/fx");
const { getEditableProducts, updateProduct, searchProducts, duplicateProduct, deleteProduct } = require("./src/backend/products-editor");
const auth = require("./src/backend/auth");
const XLSX = require("xlsx");

const app = express();

app.use(cors());
app.use(express.json());

// Initialize database on startup
auth.initializeDatabase().catch(err => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});

// ==================== FRONTEND ROUTING ====================

// Redirect root to login page
app.get("/", (req, res) => {
  res.redirect("/login.html");
});

// Map specific URLs to HTML files - use sendFile directly
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "frontend", "index.html"), { root: process.cwd() });
});

app.get("/bom-calculator", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "frontend", "bom-calculator.html"), { root: process.cwd() });
});

app.get("/products", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "frontend", "products-editor.html"), { root: process.cwd() });
});

// Public static files (CSS, JS, HTML, etc.)
app.use(express.static(path.join(__dirname, "src", "frontend"), {
  dotfiles: 'deny',
  index: false
}));

// Serve data files (e.g., PFN_logo.png) from /data
app.use('/data', express.static(path.join(__dirname, 'data')));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ==================== AUTHENTICATION ENDPOINTS ====================

// Login endpoint
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await auth.login(email, password);
    res.json(result);
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

// Get current user
app.get("/api/auth/me", auth.authMiddleware, async (req, res) => {
  try {
    const user = await auth.getCurrentUser(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout endpoint (frontend just clears token, but good for audit logging)
app.post("/api/auth/logout", auth.authMiddleware, async (req, res) => {
  try {
    await auth.auditLog(req.user.id, 'LOGOUT', 'auth', {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Main costing endpoint
app.get("/api/costs", (req, res) => {
  try {
    const displayCurrency = req.query.currency || "USD";

    const filters = {
      sapId: req.query.sapId || null,
      pfnId: req.query.pfnId || null,
      customer: req.query.customer || null,
      marketSegment: req.query.marketSegment || null,
      application: req.query.application || null,
      s_sms: req.query.s_sms || null,
      bonding: req.query.bonding || null,
      basisWeight: req.query.basisWeight || null,
      slitWidth: req.query.slitWidth || null,
      treatment: req.query.treatment || null,
      author: req.query.author || null,
      lineId: req.query.lineId || null,
      country: req.query.country || null,
      overconsumption: req.query.overconsumption || null
    };

    const data = computeCosts(displayCurrency, filters);
    res.json(data);

  } catch (err) {
    console.error("Error in /api/costs:", err);
    res.status(500).json({ error: "Failed to compute costs", details: err.message });
  }
});

// Metadata endpoint: get available filters and options
app.get("/api/metadata", (req, res) => {
  try {
    const products = loadProducts();
    
    const sapIds = [...new Set(products.map(p => p.sapId).filter(Boolean))].sort();
    const pfnIds = [...new Set(products.map(p => p.pfnId).filter(Boolean))].sort();
    const customers = [...new Set(products.map(p => p.customer).filter(Boolean))].sort();
    const marketSegments = [...new Set(products.map(p => p.marketSegment).filter(Boolean))].sort();
    const applications = [...new Set(products.map(p => p.application).filter(Boolean))].sort();
    const smsOptions = [...new Set(products.map(p => p.s_sms).filter(Boolean))].sort();
    const bondings = [...new Set(products.map(p => p.bonding).filter(Boolean))].sort();
    const basisWeights = [...new Set(products.map(p => p.basisWeight).filter(Boolean))].sort((a, b) => parseFloat(a) - parseFloat(b));
    const slitWidths = [...new Set(products.map(p => p.slitWidth).filter(Boolean))].sort((a, b) => parseFloat(a) - parseFloat(b));
    const treatments = [...new Set(products.map(p => p.treatment).filter(Boolean))].sort();
    const authors = [...new Set(products.map(p => p.author).filter(Boolean))].sort();
    const overconsumptions = [...new Set(products.map(p => p.overconsumption))].sort((a, b) => a - b);
    
    const lineIds = [...new Set(products.map(p => p.lineId))].sort();
    const countries = [...new Set(products.map(p => p.country))].sort();
    const currencies = ["USD", "CZK", "EUR", "ZAR", "GBP"];

    res.json({
      sapIds,
      pfnIds,
      customers,
      marketSegments,
      applications,
      smsOptions,
      bondings,
      basisWeights,
      slitWidths,
      treatments,
      authors,
      overconsumptions,
      lineIds,
      countries,
      currencies,
      totalProducts: products.length
    });

  } catch (err) {
    console.error("Error in /api/metadata:", err);
    res.status(500).json({ error: "Failed to load metadata", details: err.message });
  }
});

// Export data endpoint (CSV)
app.get("/api/export/costs", (req, res) => {
  try {
    const displayCurrency = req.query.currency || "USD";
    const filters = {
      sapId: req.query.sapId || null,
      pfnId: req.query.pfnId || null,
      customer: req.query.customer || null,
      marketSegment: req.query.marketSegment || null,
      application: req.query.application || null,
      s_sms: req.query.s_sms || null,
      bonding: req.query.bonding || null,
      basisWeight: req.query.basisWeight || null,
      slitWidth: req.query.slitWidth || null,
      treatment: req.query.treatment || null,
      author: req.query.author || null,
      lineId: req.query.lineId || null,
      country: req.query.country || null,
      overconsumption: req.query.overconsumption || null
    };

    const data = computeCosts(displayCurrency, filters);

    if (data.length === 0) {
      return res.status(404).json({ error: "No data to export" });
    }

    // Convert to CSV
    const headers = [
      "Product ID",
      "Line",
      "Country",
      "Material Cost (Net)",
      "Process Cost",
      "Total Cost",
      "Currency"
    ];

    const rows = data.map(item => [
      item.productId,
      item.lineId,
      item.country,
      (item.materialCostNet ?? item.materialCost ?? 0).toFixed(4),
      item.processCost.toFixed(4),
      item.totalCost.toFixed(4),
      item.currency
    ]);

    const csv = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="costs-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);

  } catch (err) {
    console.error("Error in /api/export/costs:", err);
    res.status(500).json({ error: "Failed to export costs", details: err.message });
  }
});

// Debug endpoints
app.get("/api/debug/products", (req, res) => {
  try {
    const products = loadProducts();
    res.json(products);
  } catch (err) {
    console.error("Debug products error:", err);
    res.status(500).json({ error: "Failed to load products", details: err.message });
  }
});

app.get("/api/debug/lines", (req, res) => {
  try {
    const lines = loadLines();
    res.json(lines);
  } catch (err) {
    console.error("Debug lines error:", err);
    res.status(500).json({ error: "Failed to load lines", details: err.message });
  }
});

app.get("/api/debug/materials", (req, res) => {
  try {
    const fx = loadFxRates();
    const { materials, siko } = loadMaterials(fx);
    res.json({ materials, siko });
  } catch (err) {
    console.error("Debug materials error:", err);
    res.status(500).json({ error: "Failed to load materials", details: err.message });
  }
});

app.get("/api/debug/fx", (req, res) => {
  try {
    const fx = loadFxRates();
    res.json(fx);
  } catch (err) {
    console.error("Debug fx error:", err);
    res.status(500).json({ error: "Failed to load FX rates", details: err.message });
  }
});

app.get("/api/debug/costs", (req, res) => {
  try {
    const displayCurrency = req.query.currency || "USD";
    const filters = {
      productId: req.query.productId || null,
      lineId: req.query.lineId || null,
      country: req.query.country || null
    };

    const data = computeCosts(displayCurrency, filters);

    res.json({
      currency: displayCurrency,
      filters,
      count: data.length,
      costs: data
    });

  } catch (err) {
    console.error("Debug costs error:", err);
    res.status(500).json({ error: "Failed to compute debug costs", details: err.message });
  }
});

// Product editor endpoints
app.get("/api/products/editable", (req, res) => {
  try {
    const search = req.query.search || "";
    const products = search ? searchProducts(search) : getEditableProducts();
    res.json({
      count: products.length,
      products: products
    });
  } catch (err) {
    console.error("Error loading editable products:", err);
    res.status(500).json({ error: "Failed to load editable products", details: err.message });
  }
});

// BOM Calculator endpoints
app.get("/api/bom/lists", (req, res) => {
  try {
    const sourcesPath = path.join(__dirname, "data", "Sources.xlsx");
    const workbook = XLSX.readFile(sourcesPath);
    
    if (!workbook.SheetNames.includes("Lists")) {
      return res.status(404).json({ error: "Lists sheet not found in Sources.xlsx" });
    }
    
    const listsSheet = workbook.Sheets["Lists"];
    const data = XLSX.utils.sheet_to_json(listsSheet, { header: 1, defval: "" });
    
    // First row contains headers
    const headers = data[0];
    
    // Extract lists from columns
    const list_sb = [];
    const list_mb = [];
    const list_pigment = [];
    const list_additive = [];
    const list_surfactant = [];
    const surfactant_conc_map = {};
    
    // Start from row 1 (skip headers)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0] && row[0].trim()) list_sb.push(row[0].trim());
      if (row[1] && row[1].trim()) list_mb.push(row[1].trim());
      if (row[2] && row[2].trim()) list_pigment.push(row[2].trim());
      if (row[3] && row[3].trim()) list_additive.push(row[3].trim());
      if (row[4] && row[4].trim()) {
        const surfactantName = row[4].trim();
        list_surfactant.push(surfactantName);

        const concValue = parseFloat(row[5]);
        const hasValidConc = Number.isFinite(concValue);
        const currentConc = surfactant_conc_map[surfactantName];

        if (hasValidConc && (currentConc === undefined || currentConc === "")) {
          surfactant_conc_map[surfactantName] = concValue;
        } else if (!(surfactantName in surfactant_conc_map)) {
          surfactant_conc_map[surfactantName] = "";
        }
      }
    }
    
    res.json({
      list_sb,
      list_mb,
      list_pigment,
      list_additive,
      list_surfactant,
      surfactant_conc_map
    });
  } catch (err) {
    console.error("Error loading BOM lists:", err);
    res.status(500).json({ error: "Failed to load BOM lists", details: err.message });
  }
});

app.post("/api/products/update", (req, res) => {
  try {
    const { rowIndex, updates } = req.body;
    
    if (rowIndex === undefined || rowIndex === null) {
      return res.status(400).json({ error: "Missing rowIndex in request body" });
    }
    
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ error: "Missing or invalid updates in request body" });
    }

    const result = updateProduct(rowIndex, updates);
    res.json(result);
  } catch (err) {
    console.error("Error updating product:", err);
    res.status(500).json({ error: "Failed to update product", details: err.message });
  }
});

// Duplicate (copy) a product
app.post("/api/products/duplicate", (req, res) => {
  try {
    const { rowIndex } = req.body;
    
    if (rowIndex === undefined || rowIndex === null) {
      return res.status(400).json({ error: "Missing rowIndex in request body" });
    }

    const newRowIndex = duplicateProduct(rowIndex);
    res.json({ success: true, newRowIndex });
  } catch (err) {
    console.error("Error duplicating product:", err);
    res.status(500).json({ error: "Failed to duplicate product", details: err.message });
  }
});

// Delete a product
app.post("/api/products/delete", (req, res) => {
  try {
    const { rowIndex } = req.body;
    
    if (rowIndex === undefined || rowIndex === null) {
      return res.status(400).json({ error: "Missing rowIndex in request body" });
    }

    deleteProduct(rowIndex);
    res.json({ success: true, message: "Product deleted successfully" });
  } catch (err) {
    console.error("Error deleting product:", err);
    res.status(500).json({ error: "Failed to delete product", details: err.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found", path: req.path });
});

// Global error handler - must be last
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  // If headers already sent, delegate to default express error handler
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(err.status || 500).json({ 
    error: "Internal server error", 
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ Server running at http://localhost:${PORT}`);
  console.log(`✓ Database initialized at ${path.join(__dirname, 'data', 'mini_erp.db')}`);
  console.log(``);
  console.log(`  - GET /api/health - Health check`);
  console.log(`  - GET /api/metadata - Available filters`);
  console.log(`  - GET /api/costs - Main costing endpoint`);
  console.log(`  - GET /api/export/costs - Export to CSV`);
  console.log(`Debug endpoints:`);
  console.log(`  - GET /api/debug/products`);
  console.log(`  - GET /api/debug/lines`);
  console.log(`  - GET /api/debug/materials`);
  console.log(`  - GET /api/debug/fx`);
});