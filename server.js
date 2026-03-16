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
const polymerIndexes = require("./src/backend/polymer-indexes");
const XLSX = require("xlsx");

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize database on startup
auth.initializeDatabase().catch(err => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});

polymerIndexes.initializeDatabase().catch(err => {
  console.error("Failed to initialize polymer index database:", err);
  process.exit(1);
});

// ==================== FRONTEND ROUTING ====================

// Redirect root to login page
app.get("/", (req, res, next) => {
  try {
    console.log("[ROUTE] GET / - Redirecting to /login.html");
    res.redirect("/login.html");
  } catch (err) {
    console.error("[ERROR] Root redirect failed:", err);
    next(err);
  }
});

// Map specific URLs to HTML files - use sendFile with absolute paths
app.get("/dashboard", (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "src", "frontend", "index.html");
    console.log("[ROUTE] GET /dashboard - Serving:", filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("[ERROR] Failed to send index.html:", err);
        next(err);
      }
    });
  } catch (err) {
    console.error("[ERROR] Dashboard route error:", err);
    next(err);
  }
});

app.get("/bom-calculator", (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "src", "frontend", "bom-calculator.html");
    console.log("[ROUTE] GET /bom-calculator - Serving:", filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("[ERROR] Failed to send bom-calculator.html:", err);
        next(err);
      }
    });
  } catch (err) {
    console.error("[ERROR] BOM calculator route error:", err);
    next(err);
  }
});

app.get("/products", (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "src", "frontend", "products-editor.html");
    console.log("[ROUTE] GET /products - Serving:", filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("[ERROR] Failed to send products-editor.html:", err);
        next(err);
      }
    });
  } catch (err) {
    console.error("[ERROR] Products route error:", err);
    next(err);
  }
});

app.get("/polymer-indexes", (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "src", "frontend", "polymer-indexes.html");
    console.log("[ROUTE] GET /polymer-indexes - Serving:", filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("[ERROR] Failed to send polymer-indexes.html:", err);
        next(err);
      }
    });
  } catch (err) {
    console.error("[ERROR] Polymer indexes route error:", err);
    next(err);
  }
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

// Get current user's groups
app.get("/api/auth/me/groups", auth.authMiddleware, async (req, res) => {
  console.log(`[DEBUG] GET /api/auth/me/groups called for user: ${req.user.email}`);
  try {
    const groups = await auth.getUserGroups(req.user.id);
    console.log(`[DEBUG] Found ${groups.length} groups for ${req.user.email}`);
    res.json(groups);
  } catch (err) {
    console.error(`[ERROR] /api/auth/me/groups error:`, err);
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

// Change password endpoint
app.post("/api/auth/change-password", auth.authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const result = await auth.changePassword(req.user.id, currentPassword, newPassword);
    
    if (result.success) {
      await auth.auditLog(req.user.id, 'CHANGE_PASSWORD', 'user', { email: req.user.email });
      res.json({ success: true, message: 'Password changed successfully' });
    } else {
      res.status(401).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ACCESS REQUEST ENDPOINTS ====================

// Submit access request (public endpoint for @pfnonwovens.com users)
app.post("/api/auth/request-access", async (req, res) => {
  try {
    const { email, fullName, reason } = req.body;
    const result = await auth.requestAccess(email, fullName, reason);
    res.status(201).json({
      success: true,
      message: 'Access request submitted. Please wait for approval from an administrator.',
      request: result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get access requests (admin only)
app.get("/api/admin/access-requests", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const status = req.query.status || null;
    const requests = await auth.getAccessRequests(status);
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve access request (admin only)
app.post("/api/admin/access-requests/:id/approve", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const result = await auth.approveAccessRequest(req.params.id, req.user.id);
    res.json({
      success: true,
      message: 'Access request approved. User account created.',
      data: result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Deny access request (admin only)
app.post("/api/admin/access-requests/:id/deny", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const { reason } = req.body;
    const result = await auth.denyAccessRequest(req.params.id, req.user.id, reason);
    res.json({
      success: true,
      message: 'Access request denied.',
      data: result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==================== GROUP MANAGEMENT ENDPOINTS ====================

// Get all groups (admin only)
app.get("/api/admin/groups", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const groups = await auth.getGroups();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new group (admin only)
app.post("/api/admin/groups", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    const group = await auth.createGroup(name, description, permissions);
    res.status(201).json({
      success: true,
      message: 'Group created successfully.',
      group
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Update group (admin only)
app.put("/api/admin/groups/:id", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const { name, description } = req.body;
    const group = await auth.updateGroup(req.params.id, name, description);
    res.json({
      success: true,
      message: 'Group updated successfully.',
      group
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Delete group (admin only)
app.delete("/api/admin/groups/:id", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const result = await auth.deleteGroup(req.params.id);
    res.json({
      success: true,
      message: 'Group deleted successfully.',
      result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get users in group (admin only)
app.get("/api/admin/groups/:id/users", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const users = await auth.getUsersInGroup(req.params.id);
    res.json(users);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get all users (admin only)
app.get("/api/admin/users", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const users = await auth.getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create new user directly (admin only)
app.post("/api/admin/users", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const { email, fullName, password, groupId } = req.body;
    const user = await auth.createDirectUser(email, fullName, password, groupId);
    res.status(201).json({
      success: true,
      message: 'User created successfully.',
      user
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Update user (admin only)
app.put("/api/admin/users/:userId", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const { email, fullName, password } = req.body;
    const user = await auth.updateUser(req.params.userId, email, fullName, password);
    res.json({
      success: true,
      message: 'User updated successfully.',
      user
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Remove user from group (admin only)
app.delete("/api/admin/users/:userId/groups/:groupId", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const result = await auth.removeUserFromGroup(req.params.userId, req.params.groupId);
    res.json({
      success: true,
      message: 'User removed from group successfully.',
      result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get audit logs (admin only)
app.get("/api/admin/audit-logs", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const filters = {
      userId: req.query.userId,
      action: req.query.action,
      resource: req.query.resource,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      search: req.query.search,
      limit: req.query.limit ? parseInt(req.query.limit) : 100
    };
    
    const logs = await auth.getAuditLogs(filters);
    res.json({
      success: true,
      logs
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get audit log stats (admin only)
app.get("/api/admin/audit-logs/stats", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const stats = await auth.getAuditLogStats();
    res.json({
      success: true,
      stats
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== POLYMER INDEX ENDPOINTS ====================

app.get("/api/admin/polymer-indexes", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const indexes = await polymerIndexes.getIndexes(includeInactive);
    res.json({ success: true, indexes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/admin/polymer-indexes", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const index = await polymerIndexes.createIndex(req.body || {});
    await auth.auditLog(req.user.id, 'INDEX_DEFINITION_CREATED', 'polymer_indexes', {
      indexId: index.id,
      indexName: index.name
    });
    res.status(201).json({ success: true, index });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put("/api/admin/polymer-indexes/:id", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const payload = req.body || {};

    if (Object.prototype.hasOwnProperty.call(payload, 'isActive')) {
      const existing = await auth.dbGet('SELECT is_active FROM polymer_indexes WHERE id = ?', [req.params.id]);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Index not found' });
      }

      const requestedIsActive = payload.isActive ? 1 : 0;
      if (requestedIsActive !== existing.is_active) {
        const groups = await auth.getUserGroups(req.user.id);
        const isAdminGroupMember = groups.some(group => String(group?.name || '').toLowerCase() === 'admin');

        if (!isAdminGroupMember) {
          return res.status(403).json({
            success: false,
            error: 'Only Admin group members can activate or deactivate indexes'
          });
        }
      }
    }

    const index = await polymerIndexes.updateIndex(req.params.id, payload);
    await auth.auditLog(req.user.id, 'INDEX_DEFINITION_UPDATED', 'polymer_indexes', {
      indexId: index.id,
      indexName: index.name
    });
    res.json({ success: true, index });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete("/api/admin/polymer-indexes/:id", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const groups = await auth.getUserGroups(req.user.id);
    const isAdminGroupMember = groups.some(group => String(group?.name || '').toLowerCase() === 'admin');

    if (!isAdminGroupMember) {
      return res.status(403).json({
        success: false,
        error: 'Only Admin group members can delete indexes'
      });
    }

    const result = await polymerIndexes.deleteIndex(req.params.id);

    await auth.auditLog(req.user.id, 'INDEX_DEFINITION_DELETED', 'polymer_indexes', {
      indexId: result.id,
      indexName: result.name
    });

    res.json({ success: true, result });
  } catch (err) {
    const status = err.message === 'Index not found'
      ? 404
      : err.message === 'Only deactivated indexes can be deleted'
        ? 400
        : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

app.get("/api/admin/polymer-indexes/:id/values", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const values = await polymerIndexes.getIndexValues(req.params.id, {
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
      limit: req.query.limit ? Number(req.query.limit) : 520
    });
    res.json({ success: true, values });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/api/admin/polymer-indexes/:id/values", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const value = await polymerIndexes.upsertIndexValue(req.params.id, req.body || {}, req.user.id);
    res.status(201).json({ success: true, value });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/api/admin/polymer-indexes/import", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const result = await polymerIndexes.bulkImport(rows, req.user.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get("/api/admin/polymer-indexes/reminders/due", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const due = await polymerIndexes.getDueReminders(new Date());
    res.json({ success: true, due });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/admin/polymer-indexes/data/by-week", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const startYear = Number(req.query.startYear) || 2020;
    const endYear = Number(req.query.endYear) || 2026;
    const data = await polymerIndexes.getDataByWeek({ startYear, endYear });
    res.json({ success: true, weeks: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/admin/polymer-indexes/data/all", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const result = await polymerIndexes.clearAllIndexValues();
    await auth.auditLog(req.user.id, 'DELETE_ALL_INDEX_VALUES', 'polymer_index_values', null, { deletedCount: result.deletedCount });
    res.json({ success: true, message: `Successfully deleted ${result.deletedCount} index values`, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/admin/polymer-indexes/recalculate-mid", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const result = await polymerIndexes.recalculateAllMidValues(req.user.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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
console.log(`[STARTUP] Starting server on port ${PORT}...`);
console.log(`[STARTUP] Node version: ${process.version}`);
console.log(`[STARTUP] Working directory: ${process.cwd()}`);
console.log(`[STARTUP] __dirname: ${__dirname}`);

app.listen(PORT, () => {
  console.log(`✓ Server running at http://localhost:${PORT}`);
  console.log(`✓ Database initialized at ${path.join(__dirname, 'data', 'mini_erp.db')}`);
  console.log(``);
  console.log(`Frontend routes:`);
  console.log(`  - GET / → /login.html (redirect)`);
  console.log(`  - GET /dashboard → index.html`);
  console.log(`  - GET /bom-calculator → bom-calculator.html`);
  console.log(`  - GET /products → products-editor.html`);
  console.log(``);
  console.log(`API endpoints:`);
  console.log(`  - GET /api/health - Health check`);
  console.log(`  - POST /api/auth/login - User login`);
  console.log(`  - GET /api/metadata - Available filters`);
  console.log(`  - GET /api/costs - Main costing endpoint`);
  console.log(`  - GET /api/export/costs - Export to CSV`);
  console.log(`Debug endpoints:`);
  console.log(`  - GET /api/debug/products`);
  console.log(`  - GET /api/debug/lines`);
  console.log(`  - GET /api/debug/materials`);
  console.log(`  - GET /api/debug/fx`);
});
