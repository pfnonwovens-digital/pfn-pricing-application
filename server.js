const express = require("express");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const { loadEnvFiles } = require("./src/backend/utils/env");

loadEnvFiles();

const { loadProducts } = require("./src/backend/products");
const { loadLines } = require("./src/backend/lines");
const { loadMaterials } = require("./src/backend/materials");
const { loadFxRates, convert } = require("./src/backend/fx");
const db = require("./src/backend/db/connection");
const auth = require("./src/backend/auth");
const polymerIndexes = require("./src/backend/polymer-indexes");
const rmPrices = require("./src/backend/rm-prices");
const fxRatesDb = require("./src/backend/fx-rates-db");
const fxRatesImport = require("./src/backend/fx-rates-import");
const lineRatesDb = require("./src/backend/line-rates-db");
const { parseLineRatesMatrix } = require("./src/backend/line-rates-import");
const XLSX = require("xlsx");

const app = express();

const CUSTOMER_LIST_FILE_PATH = path.join(__dirname, "data", "customer-list.json");
let customerStoreInitPromise = null;
let bomListStoreInitPromise = null;
let bomRecordStoreInitPromise = null;

const DESCRIPTION_LIST_CONFIG = [
  { key: "marketSegment", sourceHeader: "Segment", editable: 1 },
  { key: "application", sourceHeader: "Application", editable: 1 },
  { key: "smms", sourceHeader: "S/SMS", editable: 1 },
  { key: "monoBico", sourceHeader: "Mono/Bico", editable: 1 },
  { key: "structure", sourceHeader: "Structure", editable: 1 },
  { key: "bicoRatioDesc", sourceHeader: "BICO_ratio", editable: 1 },
  { key: "mainRawMat", sourceHeader: "Main RawMat", editable: 1 },
  { key: "bonding", sourceHeader: "Bonding", editable: 1 },
  { key: "treatment", sourceHeader: "Treatment", editable: 1 },
  { key: "color", sourceHeader: "Color", editable: 1 },
  { key: "line", sourceHeader: "Line", editable: 0 },
  { key: "cores", sourceHeader: "Cores", editable: 0 }
];

const DESCRIPTION_LIST_COLUMN_MAP = {
  marketSegment: "market_segment",
  application: "application",
  smms: "smms",
  monoBico: "mono_bico",
  structure: "structure",
  bicoRatioDesc: "bico_ratio_desc",
  mainRawMat: "main_raw_mat",
  bonding: "bonding",
  treatment: "treatment",
  color: "color"
};

const MATERIAL_LIST_CONFIG = [
  { key: "list_sb", columnIndex: 0 },
  { key: "list_mb", columnIndex: 1 },
  { key: "list_pigment", columnIndex: 2 },
  { key: "list_additive", columnIndex: 3 },
  { key: "list_surfactant", columnIndex: 4, numericColumnIndex: 5 }
];

const PAGE_ACCESS_MATRIX_CONFIGURED = "page:matrix:configured";
const ACCESS_PERMISSION_PAGES = [
  { key: "dashboard", title: "Dashboard", path: "/dashboard" },
  { key: "bom-calculator", title: "BOM Calculator", path: "/bom-calculator" },
  { key: "bom-recipe-browser", title: "BOM Recipe Browser", path: "/bom-recipe-browser" },
  { key: "recipe-edit-clone", title: "Recipe Edit/Clone", path: "/recipe-edit-clone" },
  { key: "recipe-approval", title: "Recipe Approval", path: "/recipe-approval" },
  { key: "rm-prices", title: "RM Prices", path: "/rm-prices" },
  { key: "polymer-indexes", title: "Polymer Indexes", path: "/polymer-indexes" },
  { key: "fx-rates", title: "FX Rates", path: "/fx-rates" },
  { key: "line-rates", title: "Line Rates", path: "/line-rates" },
  { key: "admin-access", title: "Admin Access", path: "/admin-access.html" }
];

function normalizeUniqueStrings(values) {
  const seen = new Set();
  const normalized = [];

  (values || []).forEach((value) => {
    const text = (value ?? "").toString().trim();
    if (!text) return;

    const key = text.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    normalized.push(text);
  });

  return normalized;
}

function isNaDisplayValue(value) {
  const normalized = (value ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

  return normalized === "n.a." || normalized === "n.a" || normalized === "na" || normalized === "n/a";
}

function sortValuesForDisplay(values) {
  return [...(values || [])].sort(compareValuesForDisplay);
}

function compareValuesForDisplay(a, b) {
  const aIsNa = isNaDisplayValue(a);
  const bIsNa = isNaDisplayValue(b);

  if (aIsNa && !bIsNa) return 1;
  if (!aIsNa && bIsNa) return -1;

  return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
}

function readLegacyCustomerListFile() {
  try {
    if (!fs.existsSync(CUSTOMER_LIST_FILE_PATH)) {
      return [];
    }

    const raw = fs.readFileSync(CUSTOMER_LIST_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed.customers;

    return normalizeUniqueStrings(Array.isArray(list) ? list : []);
  } catch (err) {
    console.error("Error reading legacy customer list file:", err);
    return [];
  }
}

function hasCaseInsensitiveDuplicates(values) {
  const seen = new Set();

  for (const value of values || []) {
    const text = (value ?? "").toString().trim();
    if (!text) {
      continue;
    }

    const key = text.toLowerCase();
    if (seen.has(key)) {
      return true;
    }

    seen.add(key);
  }

  return false;
}

function toMultiValueArray(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v ?? "").trim()).filter(Boolean);
  }
  if (value === undefined || value === null) {
    return [];
  }
  const text = String(value).trim();
  return text ? [text] : [];
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseOptionalYear(value) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    return null;
  }
  return year;
}

async function getLinesForYear(yearValue) {
  const baseLines = loadLines() || {};
  const year = parseOptionalYear(yearValue);
  if (!year) {
    return baseLines;
  }

  try {
    const dbRows = await lineRatesDb.getLineRatesForYear(year);
    if (!Array.isArray(dbRows) || dbRows.length === 0) {
      return baseLines;
    }

    const merged = { ...baseLines };

    for (const row of dbRows) {
      const lineId = (row.line_id || "").toString().trim();
      if (!lineId) continue;

      const existing = merged[lineId] || { lineId };
      const next = {
        ...existing,
        lineId,
        country: ((row.country || existing.country || "").toString().trim() || ""),
        currency: ((row.currency || existing.currency || "USD").toString().trim().toUpperCase() || "USD")
      };

      for (const key of lineRatesDb.NUMERIC_FIELDS) {
        next[key] = safeNumber(row[key], safeNumber(existing[key], 0));
      }

      merged[lineId] = next;
    }

    return merged;
  } catch (err) {
    console.error(`Failed to load line rates for year ${year}:`, err);
    return baseLines;
  }
}

function matchesFilter(value, allowedValues) {
  if (!Array.isArray(allowedValues) || allowedValues.length === 0) {
    return true;
  }
  return allowedValues.some((allowed) => String(value ?? "") === String(allowed));
}

async function applyRenamePairsToBomRecordColumn(columnName, renamePairs) {
  if (!columnName || !Array.isArray(renamePairs) || renamePairs.length === 0) {
    return;
  }

  const effectivePairs = renamePairs
    .map((pair) => ({
      from: String(pair?.from ?? "").trim(),
      to: String(pair?.to ?? "").trim()
    }))
    .filter((pair) => pair.from && pair.to && pair.from.toLowerCase() !== pair.to.toLowerCase());

  if (!effectivePairs.length) {
    return;
  }

  const stamp = Date.now();
  const staged = [];

  for (let i = 0; i < effectivePairs.length; i++) {
    const pair = effectivePairs[i];
    const marker = `__rename__${columnName}__${stamp}__${i}__`;

    await db.run(
      `UPDATE bom_records
       SET ${columnName} = ?, updated_at = CURRENT_TIMESTAMP
       WHERE ${columnName} = ? COLLATE NOCASE`,
      [marker, pair.from]
    );

    staged.push({ marker, to: pair.to });
  }

  for (const row of staged) {
    await db.run(
      `UPDATE bom_records
       SET ${columnName} = ?, updated_at = CURRENT_TIMESTAMP
       WHERE ${columnName} = ?`,
      [row.to, row.marker]
    );
  }
}

function normalizeRenamePairs(renamePairs, existingValues = []) {
  if (!Array.isArray(renamePairs) || renamePairs.length === 0) {
    return [];
  }

  const existingByKey = new Map(
    (existingValues || [])
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .map((value) => [value.toLowerCase(), value])
  );
  const seenFromKeys = new Set();
  const normalized = [];

  for (const pair of renamePairs) {
    const fromRaw = String(pair?.from ?? "").trim();
    const to = String(pair?.to ?? "").trim();
    if (!fromRaw || !to) {
      continue;
    }

    const fromKey = fromRaw.toLowerCase();
    const canonicalFrom = existingByKey.get(fromKey);
    if (!canonicalFrom || seenFromKeys.has(fromKey)) {
      continue;
    }

    seenFromKeys.add(fromKey);
    normalized.push({ from: canonicalFrom, to });
  }

  return normalized;
}

async function buildDbMaterialPricesForLines(lineIds, { year, month } = {}) {
  const uniqueLines = [...new Set((lineIds || []).map((lineId) => (lineId || "").toString().trim()).filter(Boolean))];
  if (!uniqueLines.length) {
    return {};
  }

  const lines = loadLines() || {};
  const fxRates = loadFxRates() || {};
  const dbMaterialPrices = {};

  const plants = [...new Set(uniqueLines
    .map((lineId) => {
      const fromLinePrefix = rmPrices.getPlantFromLine(lineId);
      if (fromLinePrefix) return fromLinePrefix;

      const fallbackCountry = (lines[lineId]?.country || "").toString().trim().toUpperCase();
      return ["CZ", "EG", "ZA"].includes(fallbackCountry) ? fallbackCountry : null;
    })
    .filter(Boolean))];

  if (!plants.length) {
    return {};
  }

  const now = new Date();
  const normalizedYear = Number.isInteger(Number(year)) ? Number(year) : now.getFullYear();
  const normalizedMonthCandidate = Number.isInteger(Number(month)) ? Number(month) : (now.getMonth() + 1);
  const normalizedMonth = Math.min(12, Math.max(1, normalizedMonthCandidate));
  const ymLimit = (normalizedYear * 100) + normalizedMonth;

  const plantPlaceholders = plants.map(() => "?").join(",");
  const rows = await db.all(
    `SELECT p.material_name, p.plant, p.price, p.currency
     FROM rm_prices p
     JOIN (
       SELECT material_name, plant, MAX((year * 100) + month) AS ym
       FROM rm_prices
       WHERE plant IN (${plantPlaceholders}) AND ((year * 100) + month) <= ?
       GROUP BY material_name, plant
     ) latest
       ON latest.material_name = p.material_name
      AND latest.plant = p.plant
      AND latest.ym = ((p.year * 100) + p.month)
     WHERE p.plant IN (${plantPlaceholders})`,
    [...plants, ymLimit, ...plants]
  );

  for (const row of rows) {
    if (row.price == null) continue;
    const currency = (row.currency || "USD").toUpperCase();
    const priceUSD = safeNumber(convert(Number(row.price), currency, "USD", fxRates));
    const key = `${String(row.material_name || "").toLowerCase()}__${String(row.plant || "").toUpperCase()}`;
    if (!key.startsWith("__")) {
      dbMaterialPrices[key] = {
        priceUSD,
        currency,
        plant: row.plant,
        material: row.material_name
      };
    }
  }

  return dbMaterialPrices;
}

function parseCalculationSnapshot(rawSnapshot) {
  if (!rawSnapshot) return null;
  try {
    const parsed = JSON.parse(rawSnapshot);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeCalculationSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  if (!snapshot.item || typeof snapshot.item !== "object") return null;

  return {
    version: Number.isFinite(Number(snapshot.version)) ? Number(snapshot.version) : 1,
    generatedAt: snapshot.generatedAt || new Date().toISOString(),
    currency: (snapshot.currency || snapshot.item.currency || "USD").toString().toUpperCase(),
    item: snapshot.item
  };
}

function normalizeBeamConfigurationSnapshot(beamConfiguration) {
  if (!beamConfiguration || typeof beamConfiguration !== "object" || Array.isArray(beamConfiguration)) {
    return null;
  }

  const normalized = {};
  const allowedKeys = new Set([
    ...Array.from({ length: 8 }, (_, index) => `gsm_${index + 1}`),
    "bico_1_B",
    "bico_2_B",
    "bico_7_B",
    "bico_8_B",
    "overconsumptionPercent"
  ]);

  for (const [key, value] of Object.entries(beamConfiguration)) {
    if (!allowedKeys.has(key)) continue;
    normalized[key] = value == null ? "" : String(value).trim();
  }

  // Normalize beam matrix material rows (optional, from full-matrix save mode)
  if (Array.isArray(beamConfiguration.rows)) {
    normalized.rows = beamConfiguration.rows
      .filter(r => r && typeof r === "object")
      .map(r => ({
        type: String(r.type || "").trim(),
        name: String(r.name || "").trim(),
        values: Array.isArray(r.values)
          ? r.values.map(v => String(v == null ? "" : v).trim())
          : []
      }));
  }

  if (!Object.keys(normalized).length) {
    return null;
  }

  const scalarHasValue = Object.entries(normalized)
    .filter(([k]) => k !== "rows")
    .some(([, v]) => String(v || "").trim() !== "");
  const rowsHaveValue = Array.isArray(normalized.rows) &&
    normalized.rows.some(r => r.type || r.name || r.values.some(v => v));
  return (scalarHasValue || rowsHaveValue) ? normalized : null;
}

function parseBeamConfiguration(rawBeamConfiguration) {
  if (!rawBeamConfiguration) return null;
  try {
    const parsed = JSON.parse(rawBeamConfiguration);
    // Return parsed as-is (already normalized when stored); only re-normalize scalars
    return normalizeBeamConfigurationSnapshot(parsed);
  } catch {
    return null;
  }
}

function normalizeRecipeDecisionInput(action) {
  const normalized = String(action || "").trim().toLowerCase();
  if (["approve", "approved"].includes(normalized)) {
    return "approve";
  }
  if (["revise", "recommend", "recommend-change", "recommend_changes", "needs-update", "needs_update"].includes(normalized)) {
    return "revise";
  }
  if (["reject", "rejected", "deny"].includes(normalized)) {
    return "reject";
  }
  return "";
}

function mapRecipeDecisionToStatus(action) {
  if (action === "approve") {
    return { recipeApproved: "Yes", approvalDecision: "Approved", label: "Approved" };
  }
  if (action === "revise") {
    return { recipeApproved: "No", approvalDecision: "Needs Update", label: "Recommended for Update" };
  }
  return { recipeApproved: "No", approvalDecision: "Rejected", label: "Rejected" };
}

function getRecipeMailTransportConfig() {
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST;
  const user = process.env.SMTP_USER || process.env.SMTP_USERNAME;
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  const port = Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 587);
  const secureFromEnv = String(process.env.SMTP_SECURE || '').trim().toLowerCase();
  const secure = secureFromEnv === 'true' ? true : (secureFromEnv === 'false' ? false : port === 465);

  if (!host || !user || !pass) {
    return null;
  }

  return {
    host,
    port,
    secure,
    auth: { user, pass }
  };
}

function getEmailVisualSpacerLines(count = 4) {
  // Many mail gateways/clients trim trailing empty lines;
  // NBSP lines stay visually blank but are less likely to be stripped.
  return Array.from({ length: count }, () => '\u00A0');
}

async function getAccessRequestAdminRecipients() {
  try {
    return await auth.getAdminNotificationEmails();
  } catch (_err) {
    return [];
  }
}

async function sendAccessRequestSubmittedEmail(accessRequest) {
  const recipients = await getAccessRequestAdminRecipients();
  if (recipients.length === 0) {
    return { sent: false, reason: 'no_admin_recipients' };
  }

  const transportConfig = getRecipeMailTransportConfig();
  if (!transportConfig) {
    return { sent: false, reason: 'smtp_not_configured' };
  }

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (_err) {
    return { sent: false, reason: 'nodemailer_not_installed' };
  }

  const transporter = nodemailer.createTransport(transportConfig);
  const from = process.env.APPROVAL_FROM_EMAIL || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  const requestedAt = accessRequest?.requested_at
    ? new Date(accessRequest.requested_at).toISOString()
    : new Date().toISOString();

  const subject = `New Access Request: ${accessRequest?.fullName || accessRequest?.email || 'Unknown user'}`;
  const bodyLines = [
    'A new user access request was submitted.',
    '',
    `Email: ${accessRequest?.email || 'N/A'}`,
    `Full name: ${accessRequest?.fullName || 'N/A'}`,
    `Reason: ${(accessRequest?.reason || '').trim() || 'N/A'}`,
    `Requested at: ${requestedAt}`,
    '',
    'Open mini-ERP Admin Access > Access Requests to review.',
    ...getEmailVisualSpacerLines(4)
  ];

  try {
    await transporter.sendMail({
      from,
      to: recipients.join(', '),
      subject,
      text: bodyLines.join('\n')
    });
    return { sent: true, recipients };
  } catch (sendErr) {
    return { sent: false, reason: sendErr.message || 'mail_send_failed' };
  }
}

async function sendRecipeDecisionEmail({ toEmail, reviewerName, decisionLabel, comment, recipeRecord }) {
  if (!toEmail) {
    return { sent: false, reason: "missing_author_email" };
  }

  const transportConfig = getRecipeMailTransportConfig();
  if (!transportConfig) {
    return { sent: false, reason: "smtp_not_configured" };
  }

  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch (_err) {
    return { sent: false, reason: "nodemailer_not_installed" };
  }

  const transporter = nodemailer.createTransport(transportConfig);
  const from = process.env.APPROVAL_FROM_EMAIL || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  const subject = `Recipe Decision: ${decisionLabel} | PD ${recipeRecord.pd_id || "N/A"}`;
  const lines = [
    "Recipe approval update",
    "",
    `Decision: ${decisionLabel}`,
    `Reviewer: ${reviewerName || "Unknown"}`,
    `SAP ID: ${recipeRecord.sap_id || "N/A"}`,
    `PD ID: ${recipeRecord.pd_id || "N/A"}`,
    `Customer: ${recipeRecord.customer || "N/A"}`,
    `Line: ${recipeRecord.line || "N/A"}`,
    "",
    "Comment:",
    comment,
    "",
    "Open mini-ERP for details.",
    ...getEmailVisualSpacerLines(4)
  ];

  await transporter.sendMail({
    from,
    to: toEmail,
    subject,
    text: lines.join("\n")
  });

  return { sent: true };
}

async function resolveAuthorEmailByUserId(userId) {
  if (!userId) {
    return null;
  }

  try {
    const user = await auth.getCurrentUser(userId);
    return user && user.email ? String(user.email).trim().toLowerCase() : null;
  } catch (_err) {
    return null;
  }
}

const RECIPE_APPROVAL_REGIONS = ['CZ', 'EG', 'RSA'];

function getRegionFromLine(lineId) {
  const plant = rmPrices.getPlantFromLine(lineId);
  if (!plant) return null;
  if (plant === 'ZA') return 'RSA';
  return plant;
}

async function resolveApproversForRegion(region) {
  try {
    const rows = await db.all(
      `SELECT u.email FROM users u
       JOIN recipe_approval_region_assignments ra ON u.id = ra.user_id
       WHERE ra.region = ? AND u.is_active = 1 AND u.email IS NOT NULL AND TRIM(u.email) != ''`,
      [region]
    );
    const emails = rows.map(r => String(r.email).trim().toLowerCase()).filter(Boolean);
    if (emails.length > 0) return emails;
  } catch (_err) {
    // fall through to env fallback
  }

  const fallbackStr = process.env.RECIPE_SUBMISSION_NOTIFY_TO
    || process.env.RECIPE_APPROVAL_NOTIFY_TO
    || process.env.APPROVAL_NOTIFY_TO
    || '';
  return fallbackStr.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

async function sendRecipeSubmissionEmail({ recipeRecord, authorName, isClone = false }) {
  const transportConfig = getRecipeMailTransportConfig();
  if (!transportConfig) {
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const region = getRegionFromLine(recipeRecord.line);

  let recipients;
  try {
    // Always resolve through helper so env fallback recipients are used
    // even when the line cannot be mapped to a known region.
    recipients = await resolveApproversForRegion(region);
  } catch (_err) {
    recipients = [];
  }

  if (recipients.length === 0) {
    return { sent: false, reason: 'no_approver_configured' };
  }

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (_err) {
    return { sent: false, reason: 'nodemailer_not_installed' };
  }

  const transporter = nodemailer.createTransport(transportConfig);
  const from = process.env.APPROVAL_FROM_EMAIL || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
  const action = isClone ? 'cloned' : 'created';
  const subject = `New Recipe Submission: PD ${recipeRecord.pd_id || 'N/A'} [${region || 'Unknown'}]`;
  const bodyLines = [
    `A new recipe has been ${action} and is awaiting approval.`,
    '',
    `PD ID: ${recipeRecord.pd_id || 'N/A'}`,
    `Customer: ${recipeRecord.customer || 'N/A'}`,
    `Line: ${recipeRecord.line || 'N/A'}`,
    `Region: ${region || 'N/A'}`,
    `Author: ${authorName || 'N/A'}`,
    '',
    'Open mini-ERP Recipe Approval to review.',
    ...getEmailVisualSpacerLines(4)
  ];

  try {
    await transporter.sendMail({ from, to: recipients.join(', '), subject, text: bodyLines.join('\n') });
    return { sent: true, recipients };
  } catch (sendErr) {
    return { sent: false, reason: sendErr.message || 'mail_send_failed' };
  }
}

async function resolveAuditPdId(recordId, fallbackPdId = null) {
  const fallback = normalizeText(fallbackPdId);
  if (fallback) return fallback;

  const numericId = Number(recordId);
  if (!Number.isFinite(numericId)) return null;

  try {
    const current = await db.get('SELECT pd_id FROM bom_records WHERE id = ?', [numericId]);
    const fromCurrent = normalizeText(current?.pd_id);
    if (fromCurrent) return fromCurrent;
  } catch (_err) {
    // Continue with audit-log fallback.
  }

  try {
    const rows = await db.all(
      `SELECT details
       FROM audit_logs
       WHERE action IN ('BOM_RECORD_CREATED', 'BOM_RECORD_CLONED', 'BOM_RECORD_UPDATED', 'RECIPE_APPROVAL_ACTION', 'BOM_RECORD_DELETED')
         AND details LIKE ?
       ORDER BY timestamp DESC
       LIMIT 50`,
      [`%"recordId":${numericId}%`]
    );

    for (const row of rows || []) {
      if (!row?.details) continue;

      let parsed;
      try {
        parsed = JSON.parse(row.details);
      } catch (_parseErr) {
        continue;
      }

      if (Number(parsed?.recordId) !== numericId) continue;

      const fromAudit = normalizeText(parsed?.pdId || parsed?.pd_id);
      if (fromAudit) return fromAudit;
    }
  } catch (_err) {
    // If fallback lookup fails, keep null to avoid breaking the action itself.
  }

  return null;
}

function computeBomRecipeCostItem({ record, recordMaterials, displayCurrency, dbMaterialPrices = {}, fx, lines, loaded }) {
  const lineId = (record.line || "").toString().trim();
  if (!lineId) return null;

  const line = lines[lineId];
  if (!line) return null;

  const country = (line.country || "").toString().trim();
  const pricingRegion = rmPrices.getPlantFromLine(lineId) || country;
  const overconsRaw = safeNumber(record.overconsumption, 0);
  const overconsumption = overconsRaw > 1 ? (overconsRaw / 100) : overconsRaw;
  const grossYieldRaw = safeNumber(record.gross_yield_percent, 100);
  const grossYieldFraction = grossYieldRaw > 1 ? (grossYieldRaw / 100) : grossYieldRaw;
  const grossYield = grossYieldFraction > 0 ? grossYieldFraction : 1;
  const throughput = safeNumber(record.total_throughput, 1) || 1;

  const projection = {
    sapId: record.sap_id,
    pfnId: record.pd_id,
    recipeApproved: record.recipe_approved,
    customer: record.customer,
    marketSegment: record.market_segment,
    application: record.application,
    s_sms: record.smms,
    bonding: record.bonding,
    basisWeight: record.customer_bw,
    slitWidth: record.slit_width,
    treatment: record.treatment,
    author: record.author,
    lineId,
    country,
    overconsumption: overconsRaw
  };

  const lineCurrency = line.currency || "USD";
  const energy = safeNumber(line.energy);
  const wages = safeNumber(line.wages);
  const maintenance = safeNumber(line.maintenance);
  const other = safeNumber(line.other_costs);
  const sgna = safeNumber(line.sga_and_overhead);
  const cores = safeNumber(line.cores);
  const packaging = safeNumber(line.packaging);
  const pallets = safeNumber(line.pallets);

  const hourlyCostLocal = energy + wages + maintenance + other + sgna;
  const perTonCostLocal = cores + packaging + pallets;

  const hourlyCostUSD = safeNumber(convert(hourlyCostLocal, lineCurrency, "USD", fx));
  const perTonCostUSD = safeNumber(convert(perTonCostLocal, lineCurrency, "USD", fx));

  let materialCostPerKgUSD = 0;
  let baseMaterialCostPerKgUSD = 0;
  const materialBreakdown = [];

  for (const m of (recordMaterials || [])) {
    const materialName = (m.material_name || "").toString().trim();
    if (!materialName) continue;

    const pct = safeNumber(m.percentage, 0) / 100;
    if (pct <= 0) continue;

    const effectivePct = pct * (1 + overconsumption);
    const key = `${materialName}__${pricingRegion}`;
    const dbKey = `${materialName.toLowerCase()}__${pricingRegion}`;
    const priced = dbMaterialPrices[dbKey] || loaded.materials[key];

    let priceUSD = null;
    let baseCost = 0;
    let finalCost = 0;
    let missingPrice = true;

    if (priced) {
      priceUSD = safeNumber(priced.priceUSD);
      baseCost = pct * priceUSD;
      finalCost = effectivePct * priceUSD;
      missingPrice = false;

      baseMaterialCostPerKgUSD += baseCost;
      materialCostPerKgUSD += finalCost;
    }

    materialBreakdown.push({
      material: materialName,
      basePct: pct,
      effectivePct,
      priceUSD,
      baseCost,
      finalCost,
      missingPrice
    });
  }

  const overconsumptionImpact = materialCostPerKgUSD - baseMaterialCostPerKgUSD;
  const scrapFraction = 1 - grossYield;
  const sikoCostUSD = safeNumber(loaded.siko[pricingRegion] ?? loaded.siko[country]);
  const netCostBeforeScrapUSD = materialCostPerKgUSD / grossYield;
  const scrapValueUSD = (scrapFraction / grossYield) * sikoCostUSD;
  const netMaterialCostPerKgUSD = netCostBeforeScrapUSD - scrapValueUSD;

  const hoursPerTon = (1000 / grossYield) / throughput;
  const hourlyCostContribution = (hourlyCostUSD * hoursPerTon) / 1000;
  const perTonCostContribution = perTonCostUSD / 1000;
  const processCostPerKgUSD = hourlyCostContribution + perTonCostContribution;
  const totalCostPerKgUSD = netMaterialCostPerKgUSD + processCostPerKgUSD;

  const materialCostGross = safeNumber(convert(materialCostPerKgUSD, "USD", displayCurrency, fx));
  const materialCostNet = safeNumber(convert(netMaterialCostPerKgUSD, "USD", displayCurrency, fx));
  const processCost = safeNumber(convert(processCostPerKgUSD, "USD", displayCurrency, fx));
  const totalCost = safeNumber(convert(totalCostPerKgUSD, "USD", displayCurrency, fx));

  return {
    id: record.id,
    sapId: projection.sapId,
    pfnId: projection.pfnId,
    recipeApproved: projection.recipeApproved || "",
    customer: projection.customer,
    marketSegment: projection.marketSegment,
    application: projection.application,
    s_sms: projection.s_sms,
    bonding: projection.bonding,
    basisWeight: projection.basisWeight,
    slitWidth: projection.slitWidth,
    treatment: projection.treatment,
    author: projection.author,
    lineId: projection.lineId,
    country: projection.country,
    grossYield,
    throughput,
    overconsumption,

    materialCostGross,
    materialCostNet,
    materialCost: materialCostNet,
    processCost,
    totalCost,
    currency: displayCurrency,

    fxRates: fx,
    details: {
      materials: materialBreakdown,
      baseMaterialCostPerKgUSD,
      finalMaterialCostPerKgUSD: materialCostPerKgUSD,
      overconsumptionImpact,
      netMaterialCostPerKgUSD,
      sikoCostUSD,
      scrapFraction,
      grossYield,
      process: {
        hoursPerTon,
        hourlyCostUSD,
        perTonCostUSD,
        hourlyCostContribution,
        perTonCostContribution,
        hourlyComponents: {
          energyUSD: safeNumber(convert(energy, lineCurrency, "USD", fx)),
          wagesUSD: safeNumber(convert(wages, lineCurrency, "USD", fx)),
          maintenanceUSD: safeNumber(convert(maintenance, lineCurrency, "USD", fx)),
          otherUSD: safeNumber(convert(other, lineCurrency, "USD", fx)),
          sgnaUSD: safeNumber(convert(sgna, lineCurrency, "USD", fx))
        },
        perTonComponents: {
          coresUSD: safeNumber(convert(cores, lineCurrency, "USD", fx)),
          packagingUSD: safeNumber(convert(packaging, lineCurrency, "USD", fx)),
          palletsUSD: safeNumber(convert(pallets, lineCurrency, "USD", fx))
        }
      }
    }
  };
}

function computeBomRecipeSummaryCosts({ records, materialsByRecord, displayCurrency, filters, dbMaterialPrices = {}, linesOverride = null }) {
  const fx = loadFxRates() || {};
  const lines = linesOverride || loadLines() || {};
  const loaded = loadMaterials(fx) || {};
  const results = [];

  for (const record of records) {
    try {
      const projection = {
        sapId: record.sap_id,
        pfnId: record.pd_id,
        customer: record.customer,
        marketSegment: record.market_segment,
        application: record.application,
        s_sms: record.smms,
        bonding: record.bonding,
        basisWeight: record.customer_bw,
        slitWidth: record.slit_width,
        treatment: record.treatment,
        author: record.author,
        lineId: (record.line || "").toString().trim(),
        country: ((lines[(record.line || "").toString().trim()] || {}).country || "").toString().trim(),
        overconsumption: safeNumber(record.overconsumption, 0)
      };

      if (!matchesFilter(projection.sapId, filters.sapId)) continue;
      if (!matchesFilter(projection.pfnId, filters.pfnId)) continue;
      if (!matchesFilter(projection.customer, filters.customer)) continue;
      if (!matchesFilter(projection.marketSegment, filters.marketSegment)) continue;
      if (!matchesFilter(projection.application, filters.application)) continue;
      if (!matchesFilter(projection.s_sms, filters.s_sms)) continue;
      if (!matchesFilter(projection.bonding, filters.bonding)) continue;
      if (!matchesFilter(projection.basisWeight, filters.basisWeight)) continue;
      if (!matchesFilter(projection.slitWidth, filters.slitWidth)) continue;
      if (!matchesFilter(projection.treatment, filters.treatment)) continue;
      if (!matchesFilter(projection.author, filters.author)) continue;
      if (!matchesFilter(projection.lineId, filters.lineId)) continue;
      if (!matchesFilter(projection.country, filters.country)) continue;
      if (!matchesFilter(projection.overconsumption, filters.overconsumption)) continue;

      const recordMaterials = materialsByRecord.get(record.id) || [];
      const item = computeBomRecipeCostItem({
        record,
        recordMaterials,
        displayCurrency,
        dbMaterialPrices,
        fx,
        lines,
        loaded
      });

      if (!item) continue;

      item.createdAt = record.created_at || null;
      item.updatedAt = record.updated_at || null;
      item.savedSnapshot = parseCalculationSnapshot(record.calculation_snapshot_json);
      results.push(item);
    } catch (err) {
      console.error("Error computing recipe summary item", record?.id, err);
    }
  }

  return results;
}

function getCustomerSeedValuesFromSources() {
  const sourceData = getListsSheetRowsFromSources();
  const headerMap = new Map(
    (sourceData.headers || []).map((header, index) => [normalizeHeaderText(header), index])
  );

  const customerColumnIndex = headerMap.get("customer");
  if (customerColumnIndex === undefined) {
    return [];
  }

  return normalizeUniqueStrings(sourceData.rows.map((row) => row[customerColumnIndex]));
}

function getCustomerSeedValuesFromProducts() {
  try {
    const products = loadProducts();
    return normalizeUniqueStrings((products || []).map((item) => item.customer));
  } catch (err) {
    console.warn("Customer seed from products failed:", err.message || err);
    return [];
  }
}

function normalizeHeaderText(value) {
  return (value || "").toString().trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getListsSheetRowsFromSources() {
  const sourceCandidates = [
    path.join(__dirname, "data", "File Sources.xlsx"),
    path.join(__dirname, "data", "Sources.xlsx")
  ];

  for (const sourcePath of sourceCandidates) {
    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    const workbook = XLSX.readFile(sourcePath);
    const listsSheetName = (workbook.SheetNames || []).find((name) => normalizeHeaderText(name) === "lists");
    if (!listsSheetName) {
      continue;
    }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[listsSheetName], { header: 1, defval: "" });
    const headers = rows[0] || [];
    return {
      headers,
      rows: rows.slice(1)
    };
  }

  return {
    headers: [],
    rows: []
  };
}

async function hasGroupPermission(userId, permission) {
  const groups = await auth.getUserGroups(userId);
  return groups.some((group) => Array.isArray(group.permissions) && group.permissions.includes(permission));
}

function pageReadPermissionKey(pageKey) {
  return `page:${pageKey}:read`;
}

function pageModifyPermissionKey(pageKey) {
  return `page:${pageKey}:modify`;
}

function normalizeGroupPermissions(group) {
  if (!group || !Array.isArray(group.permissions)) {
    return [];
  }

  return group.permissions
    .map((permission) => String(permission || "").trim())
    .filter(Boolean);
}

function hasConfiguredPageMatrix(permissions) {
  return permissions.includes(PAGE_ACCESS_MATRIX_CONFIGURED);
}

function getLegacyPageDefaultsForGroup(group, pageKey) {
  const groupName = String(group?.name || "").trim().toLowerCase();
  const permissions = normalizeGroupPermissions(group);

  const isAdminGroup = groupName === "admin";
  const isFinanceGroup = groupName === "finance group";
  const isProcurementTeamGroup = groupName === "procurement team";
  const hasUserManage = permissions.includes("user:manage") || permissions.includes("system:admin");

  let modify = false;
  if (isAdminGroup || hasUserManage) {
    modify = true;
  } else if (pageKey === "fx-rates" && isFinanceGroup) {
    modify = true;
  } else if (pageKey === "polymer-indexes" && isProcurementTeamGroup) {
    modify = true;
  } else if (pageKey === "rm-prices" && permissions.includes("rm_prices:manage")) {
    modify = true;
  }

  return {
    read: true,
    modify
  };
}

function getGroupPagePermissions(group, pageKey) {
  const permissions = normalizeGroupPermissions(group);
  const hasConfiguredMatrix = hasConfiguredPageMatrix(permissions);

  const explicitRead = permissions.includes(pageReadPermissionKey(pageKey));
  const explicitModify = permissions.includes(pageModifyPermissionKey(pageKey));

  if (hasConfiguredMatrix) {
    return {
      read: explicitRead || explicitModify,
      modify: explicitModify
    };
  }

  if (explicitRead || explicitModify) {
    return {
      read: explicitRead || explicitModify,
      modify: explicitModify
    };
  }

  return getLegacyPageDefaultsForGroup(group, pageKey);
}

async function hasPagePermission(userId, pageKey, accessLevel = "read") {
  const groups = await auth.getUserGroups(userId);

  if (!Array.isArray(groups) || groups.length === 0) {
    return false;
  }

  return groups.some((group) => {
    const pagePermissions = getGroupPagePermissions(group, pageKey);
    if (accessLevel === "modify") {
      return pagePermissions.modify;
    }
    return pagePermissions.read;
  });
}

function getPermissionsWithoutPageKeys(permissions) {
  return (permissions || []).filter((permission) => !String(permission).startsWith("page:"));
}

function buildPagePermissionTokens(matrixByPage) {
  const permissions = [PAGE_ACCESS_MATRIX_CONFIGURED];

  ACCESS_PERMISSION_PAGES.forEach((page) => {
    const row = matrixByPage && typeof matrixByPage === "object" ? matrixByPage[page.key] : null;
    const read = !!(row && row.read);
    const modify = !!(row && row.modify);

    if (read || modify) {
      permissions.push(pageReadPermissionKey(page.key));
    }
    if (modify) {
      permissions.push(pageModifyPermissionKey(page.key));
    }
  });

  return permissions;
}

function buildAccessMatrixRow(group) {
  const pagePermissions = {};

  ACCESS_PERMISSION_PAGES.forEach((page) => {
    pagePermissions[page.key] = getGroupPagePermissions(group, page.key);
  });

  return {
    id: group.id,
    name: group.name,
    description: group.description || "",
    created_at: group.created_at,
    pagePermissions
  };
}

function requireRmPricesManage(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  Promise.resolve()
    .then(async () => {
      if (auth.hasPermission(req.user.role, "user:manage")) {
        return true;
      }
      if (await hasPagePermission(req.user.id, "rm-prices", "modify")) {
        return true;
      }
      return hasGroupPermission(req.user.id, "rm_prices:manage");
    })
    .then((allowed) => {
      if (!allowed) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      return next();
    })
    .catch((err) => {
      console.error("rm_prices permission check failed:", err);
      return res.status(500).json({ error: "Failed to verify permissions" });
    });
}

function requireFxRatesManage(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  Promise.resolve()
    .then(async () => {
      if (auth.hasPermission(req.user.role, "user:manage")) {
        return true;
      }
      return hasPagePermission(req.user.id, "fx-rates", "modify");
    })
    .then((allowed) => {
      if (!allowed) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      return next();
    })
    .catch((err) => {
      console.error("fx_rates permission check failed:", err);
      return res.status(500).json({ error: "Failed to verify permissions" });
    });
}

function requireLineRatesManage(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  Promise.resolve()
    .then(async () => {
      if (auth.hasPermission(req.user.role, "user:manage")) {
        return true;
      }
      if (await hasPagePermission(req.user.id, "line-rates", "modify")) {
        return true;
      }
      // Backward compatibility for legacy group permissions.
      return hasGroupPermission(req.user.id, "rm_prices:manage");
    })
    .then((allowed) => {
      if (!allowed) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      return next();
    })
    .catch((err) => {
      console.error("line_rates permission check failed:", err);
      return res.status(500).json({ error: "Failed to verify permissions" });
    });
}

function requirePolymerIndexManage(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  Promise.resolve()
    .then(async () => {
      if (auth.hasPermission(req.user.role, "user:manage")) {
        return true;
      }
      return hasPagePermission(req.user.id, "polymer-indexes", "modify");
    })
    .then((allowed) => {
      if (!allowed) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      return next();
    })
    .catch((err) => {
      console.error("polymer index permission check failed:", err);
      return res.status(500).json({ error: "Failed to verify permissions" });
    });
}

function requireRecipeApprovalRead(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  Promise.resolve()
    .then(async () => {
      if (auth.hasPermission(req.user.role, "user:manage")) {
        return true;
      }
      return hasPagePermission(req.user.id, "recipe-approval", "read");
    })
    .then((allowed) => {
      if (!allowed) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      return next();
    })
    .catch((err) => {
      console.error("recipe approval read permission check failed:", err);
      return res.status(500).json({ error: "Failed to verify permissions" });
    });
}

function requireRecipeApprovalModify(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  Promise.resolve()
    .then(async () => {
      if (auth.hasPermission(req.user.role, "user:manage")) {
        return true;
      }
      return hasPagePermission(req.user.id, "recipe-approval", "modify");
    })
    .then((allowed) => {
      if (!allowed) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      return next();
    })
    .catch((err) => {
      console.error("recipe approval modify permission check failed:", err);
      return res.status(500).json({ error: "Failed to verify permissions" });
    });
}

function requireRecipeEditCloneRead(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  Promise.resolve()
    .then(async () => {
      if (auth.hasPermission(req.user.role, "user:manage")) {
        return true;
      }
      return hasPagePermission(req.user.id, "recipe-edit-clone", "read");
    })
    .then((allowed) => {
      if (!allowed) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      return next();
    })
    .catch((err) => {
      console.error("recipe edit/clone read permission check failed:", err);
      return res.status(500).json({ error: "Failed to verify permissions" });
    });
}

function requireRecipeEditCloneModify(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  Promise.resolve()
    .then(async () => {
      if (auth.hasPermission(req.user.role, "user:manage")) {
        return true;
      }
      return hasPagePermission(req.user.id, "recipe-edit-clone", "modify");
    })
    .then((allowed) => {
      if (!allowed) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      return next();
    })
    .catch((err) => {
      console.error("recipe edit/clone modify permission check failed:", err);
      return res.status(500).json({ error: "Failed to verify permissions" });
    });
}

async function ensureBomListStoreReady() {
  if (!bomListStoreInitPromise) {
    bomListStoreInitPromise = (async () => {
      await db.init();

      await db.run(`
        CREATE TABLE IF NOT EXISTS bom_dropdown_lists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          list_key TEXT NOT NULL UNIQUE,
          list_group TEXT NOT NULL,
          editable INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await db.run(`
        CREATE TABLE IF NOT EXISTS bom_dropdown_list_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          list_id INTEGER NOT NULL,
          value TEXT NOT NULL COLLATE NOCASE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          numeric_value REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (list_id) REFERENCES bom_dropdown_lists(id) ON DELETE CASCADE,
          UNIQUE(list_id, value)
        )
      `);

      for (const list of DESCRIPTION_LIST_CONFIG) {
        await db.run(
          `INSERT INTO bom_dropdown_lists (list_key, list_group, editable)
           VALUES (?, 'description', ?)
           ON CONFLICT(list_key) DO UPDATE SET
             list_group='description',
             editable=excluded.editable,
             updated_at=CURRENT_TIMESTAMP`,
          [list.key, list.editable]
        );
      }

      for (const list of MATERIAL_LIST_CONFIG) {
        await db.run(
          `INSERT INTO bom_dropdown_lists (list_key, list_group, editable)
           VALUES (?, 'material', 0)
           ON CONFLICT(list_key) DO UPDATE SET
             list_group='material',
             editable=0,
             updated_at=CURRENT_TIMESTAMP`,
          [list.key]
        );
      }

      const sourceData = getListsSheetRowsFromSources();
      const headerMap = new Map(
        (sourceData.headers || []).map((header, index) => [normalizeHeaderText(header), index])
      );

      for (const list of DESCRIPTION_LIST_CONFIG) {
        const listRow = await db.get("SELECT id FROM bom_dropdown_lists WHERE list_key = ?", [list.key]);
        if (!listRow) {
          continue;
        }

        const itemCountRow = await db.get(
          "SELECT COUNT(*) AS count FROM bom_dropdown_list_items WHERE list_id = ?",
          [listRow.id]
        );
        if ((itemCountRow?.count || 0) > 0) {
          continue;
        }

        const sourceIndex = headerMap.get(normalizeHeaderText(list.sourceHeader));
        if (sourceIndex === undefined) {
          continue;
        }

        const values = normalizeUniqueStrings(sourceData.rows.map((row) => row[sourceIndex]));
        for (let i = 0; i < values.length; i++) {
          await db.run(
            "INSERT INTO bom_dropdown_list_items (list_id, value, sort_order) VALUES (?, ?, ?)",
            [listRow.id, values[i], i]
          );
        }
      }

      for (const list of MATERIAL_LIST_CONFIG) {
        const listRow = await db.get("SELECT id FROM bom_dropdown_lists WHERE list_key = ?", [list.key]);
        if (!listRow) {
          continue;
        }

        const itemCountRow = await db.get(
          "SELECT COUNT(*) AS count FROM bom_dropdown_list_items WHERE list_id = ?",
          [listRow.id]
        );
        if ((itemCountRow?.count || 0) > 0) {
          continue;
        }

        const values = [];
        const numericMap = {};

        for (const row of sourceData.rows) {
          const rawValue = row[list.columnIndex];
          const textValue = (rawValue ?? "").toString().trim();
          if (!textValue) {
            continue;
          }

          const existingIndex = values.findIndex((item) => item.toLowerCase() === textValue.toLowerCase());
          if (existingIndex === -1) {
            values.push(textValue);
          }

          if (list.numericColumnIndex !== undefined) {
            const numericRaw = parseFloat(row[list.numericColumnIndex]);
            if (Number.isFinite(numericRaw) && numericMap[textValue] === undefined) {
              numericMap[textValue] = numericRaw;
            }
          }
        }

        for (let i = 0; i < values.length; i++) {
          const value = values[i];
          await db.run(
            "INSERT INTO bom_dropdown_list_items (list_id, value, sort_order, numeric_value) VALUES (?, ?, ?, ?)",
            [listRow.id, value, i, numericMap[value] ?? null]
          );
        }
      }
    })();
  }

  return bomListStoreInitPromise;
}

async function getDescriptionListValues() {
  await ensureBomListStoreReady();
  const rows = await db.all(`
    SELECT l.list_key, i.value
    FROM bom_dropdown_lists l
    LEFT JOIN bom_dropdown_list_items i ON i.list_id = l.id
    WHERE l.list_group = 'description'
    ORDER BY l.list_key, i.sort_order, lower(i.value)
  `);

  const result = {};
  DESCRIPTION_LIST_CONFIG.forEach((list) => {
    result[list.key] = [];
  });

  rows.forEach((row) => {
    if (row.value) {
      result[row.list_key].push(row.value);
    }
  });

  Object.keys(result).forEach((key) => {
    result[key] = sortValuesForDisplay(result[key]);
  });

  return result;
}

async function saveDescriptionListValuesWithoutDeletion(listKey, values, renamePairsInput = []) {
  await ensureBomListStoreReady();

  const config = DESCRIPTION_LIST_CONFIG.find((item) => item.key === listKey);
  if (!config) {
    const error = new Error("Unknown description list key.");
    error.code = "DESCRIPTION_LIST_UNKNOWN";
    throw error;
  }

  if (!config.editable) {
    const error = new Error("This list is read-only.");
    error.code = "DESCRIPTION_LIST_READONLY";
    throw error;
  }

  const normalized = normalizeUniqueStrings(values);
  const listRow = await db.get("SELECT id FROM bom_dropdown_lists WHERE list_key = ?", [listKey]);
  if (!listRow) {
    const error = new Error("Description list not found.");
    error.code = "DESCRIPTION_LIST_UNKNOWN";
    throw error;
  }

  const existingRows = await db.all(
    "SELECT id, value FROM bom_dropdown_list_items WHERE list_id = ? ORDER BY sort_order, id",
    [listRow.id]
  );
  const orderedRows = [...existingRows].sort((a, b) => compareValuesForDisplay(a.value, b.value));

  if (normalized.length < existingRows.length) {
    const error = new Error("Removing existing values is not allowed.");
    error.code = "DESCRIPTION_LIST_REMOVAL_NOT_ALLOWED";
    throw error;
  }

  await db.run("BEGIN IMMEDIATE TRANSACTION");
  try {
    const timestamp = Date.now();
    const inferredRenamePairs = orderedRows.map((row, index) => ({
      from: row.value,
      to: normalized[index]
    }));
    const renamePairs = normalizeRenamePairs(renamePairsInput, orderedRows.map((row) => row.value));

    for (const row of orderedRows) {
      await db.run(
        "UPDATE bom_dropdown_list_items SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [`__tmp__${row.id}__${timestamp}`, row.id]
      );
    }

    for (let i = 0; i < orderedRows.length; i++) {
      await db.run(
        `UPDATE bom_dropdown_list_items
         SET value = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [normalized[i], i, orderedRows[i].id]
      );
    }

    for (let i = orderedRows.length; i < normalized.length; i++) {
      await db.run(
        "INSERT INTO bom_dropdown_list_items (list_id, value, sort_order) VALUES (?, ?, ?)",
        [listRow.id, normalized[i], i]
      );
    }

    const targetColumn = DESCRIPTION_LIST_COLUMN_MAP[listKey];
    if (targetColumn) {
      await applyRenamePairsToBomRecordColumn(targetColumn, renamePairs.length ? renamePairs : inferredRenamePairs);
    }

    await db.run("COMMIT");
  } catch (error) {
    await db.run("ROLLBACK").catch(() => {});
    throw error;
  }

  const refreshed = await getDescriptionListValues();
  return refreshed[listKey] || [];
}

async function getMaterialListValues() {
  await ensureBomListStoreReady();

  const rows = await db.all(`
    SELECT l.list_key, i.value, i.numeric_value
    FROM bom_dropdown_lists l
    LEFT JOIN bom_dropdown_list_items i ON i.list_id = l.id
    WHERE l.list_group = 'material'
    ORDER BY l.list_key, i.sort_order, lower(i.value)
  `);

  const payload = {
    list_sb: [],
    list_mb: [],
    list_pigment: [],
    list_additive: [],
    list_surfactant: [],
    surfactant_conc_map: {}
  };

  rows.forEach((row) => {
    if (!row.value) {
      return;
    }

    if (payload[row.list_key]) {
      payload[row.list_key].push(row.value);
    }

    if (row.list_key === "list_surfactant") {
      payload.surfactant_conc_map[row.value] = Number.isFinite(row.numeric_value) ? row.numeric_value : "";
    }
  });

  payload.list_sb = sortValuesForDisplay(payload.list_sb);
  payload.list_mb = sortValuesForDisplay(payload.list_mb);
  payload.list_pigment = sortValuesForDisplay(payload.list_pigment);
  payload.list_additive = sortValuesForDisplay(payload.list_additive);
  payload.list_surfactant = sortValuesForDisplay(payload.list_surfactant);

  return payload;
}

async function ensureCustomerStoreReady() {
  if (!customerStoreInitPromise) {
    customerStoreInitPromise = (async () => {
      await db.init();

      await db.run(`
        CREATE TABLE IF NOT EXISTS bom_customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const countRow = await db.get("SELECT COUNT(*) AS count FROM bom_customers");
      const existingCount = countRow?.count || 0;
      if (existingCount > 0) {
        return;
      }

      const legacyCustomers = readLegacyCustomerListFile();
      const sourceCustomers = getCustomerSeedValuesFromSources();
      const productCustomers = getCustomerSeedValuesFromProducts();
      const seedCustomers = normalizeUniqueStrings([
        ...legacyCustomers,
        ...sourceCustomers,
        ...productCustomers
      ]);

      if (seedCustomers.length === 0) {
        return;
      }

      await db.run("BEGIN IMMEDIATE TRANSACTION");
      try {
        for (const customerName of seedCustomers) {
          await db.run("INSERT INTO bom_customers (name) VALUES (?)", [customerName]);
        }
        await db.run("COMMIT");
      } catch (error) {
        await db.run("ROLLBACK").catch(() => {});
        throw error;
      }
    })();
  }

  return customerStoreInitPromise;
}

async function getCustomerRowsById() {
  await ensureCustomerStoreReady();
  return db.all("SELECT id, name FROM bom_customers ORDER BY id ASC");
}

async function getCustomerNames() {
  await ensureCustomerStoreReady();
  const rows = await db.all("SELECT name FROM bom_customers");
  return sortValuesForDisplay(rows.map((row) => row.name));
}

async function saveCustomerNamesWithoutDeletion(customers, renamePairsInput = []) {
  const normalized = normalizeUniqueStrings(customers);
  const existingRows = await getCustomerRowsById();
  const orderedRows = [...existingRows].sort((a, b) => compareValuesForDisplay(a.name, b.name));

  if (normalized.length < existingRows.length) {
    const error = new Error("Removing existing customers is not allowed.");
    error.code = "CUSTOMER_REMOVAL_NOT_ALLOWED";
    throw error;
  }

  await db.run("BEGIN IMMEDIATE TRANSACTION");
  try {
    const timestamp = Date.now();
    const inferredRenamePairs = orderedRows.map((row, index) => ({
      from: row.name,
      to: normalized[index]
    }));
    const renamePairs = normalizeRenamePairs(renamePairsInput, orderedRows.map((row) => row.name));

    // Two-phase rename avoids unique collisions during swaps (e.g. A->B and B->A).
    for (const row of orderedRows) {
      await db.run(
        "UPDATE bom_customers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [`__tmp__${row.id}__${timestamp}`, row.id]
      );
    }

    for (let i = 0; i < orderedRows.length; i++) {
      await db.run(
        "UPDATE bom_customers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [normalized[i], orderedRows[i].id]
      );
    }

    for (let i = orderedRows.length; i < normalized.length; i++) {
      await db.run(
        "INSERT INTO bom_customers (name) VALUES (?)",
        [normalized[i]]
      );
    }

    await applyRenamePairsToBomRecordColumn("customer", renamePairs.length ? renamePairs : inferredRenamePairs);

    await db.run("COMMIT");
  } catch (error) {
    await db.run("ROLLBACK").catch(() => {});
    throw error;
  }

  return getCustomerNames();
}

async function ensureBomRecordStoreReady() {
  if (!bomRecordStoreInitPromise) {
    bomRecordStoreInitPromise = (async () => {
      await db.init();

      await db.run(`
        CREATE TABLE IF NOT EXISTS bom_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sap_id TEXT,
          pd_id TEXT,
          customer TEXT,
          market_segment TEXT,
          application TEXT,
          smms TEXT,
          mono_bico TEXT,
          structure TEXT,
          bico_ratio_desc TEXT,
          main_raw_mat TEXT,
          treatment TEXT,
          color TEXT,
          bonding TEXT,
          customer_bw REAL,
          belt_bw REAL,
          mb_grams REAL,
          line TEXT,
          belt_speed REAL,
          siko_percent REAL,
          repro_percent REAL,
          max_usable_width REAL,
          usable_width REAL,
          edge_trim_percent REAL,
          web_loss_percent REAL,
          other_scrap_percent REAL,
          total_scrap_percent REAL,
          gross_yield_percent REAL,
          s_beams INTEGER,
          m_beams INTEGER,
          sb_throughput REAL,
          mb_throughput REAL,
          total_throughput REAL,
          production_time REAL,
          cores TEXT,
          slit_width REAL,
          length_meters REAL,
          roll_diameter REAL,
          target_production REAL,
          target_unit TEXT,
          overconsumption REAL,
          notes TEXT,
          author TEXT,
          beam_configuration_json TEXT,
          has_beam_configuration INTEGER DEFAULT 0,
          recipe_approved TEXT DEFAULT 'Yes',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_by INTEGER
        )
      `);

      // Migration: Add author column if it doesn't exist
      try {
        await db.run('ALTER TABLE bom_records ADD COLUMN author TEXT');
        console.log('[MIGRATION] Added author column to bom_records');
      } catch (err) {
        // Column already exists, that's fine
        if (!err.message.includes('duplicate column name')) {
          console.error('[MIGRATION] Error adding author column:', err.message);
        }
      };

      // Migration: Add overconsumption column if it doesn't exist
      try {
        await db.run('ALTER TABLE bom_records ADD COLUMN overconsumption REAL');
        console.log('[MIGRATION] Added overconsumption column to bom_records');
      } catch (err) {
        if (!err.message.includes('duplicate column name')) {
          console.error('[MIGRATION] Error adding overconsumption column:', err.message);
        }
      };

      // Migration: Add immutable calculation snapshot if it doesn't exist
      try {
        await db.run('ALTER TABLE bom_records ADD COLUMN calculation_snapshot_json TEXT');
        console.log('[MIGRATION] Added calculation_snapshot_json column to bom_records');
      } catch (err) {
        if (!err.message.includes('duplicate column name')) {
          console.error('[MIGRATION] Error adding calculation_snapshot_json column:', err.message);
        }
      };

      // Migration: Add beam configuration payload if it doesn't exist
      try {
        await db.run('ALTER TABLE bom_records ADD COLUMN beam_configuration_json TEXT');
        console.log('[MIGRATION] Added beam_configuration_json column to bom_records');
      } catch (err) {
        if (!err.message.includes('duplicate column name')) {
          console.error('[MIGRATION] Error adding beam_configuration_json column:', err.message);
        }
      }

      // Migration: Add flag for records that carry Beam Configuration
      try {
        await db.run('ALTER TABLE bom_records ADD COLUMN has_beam_configuration INTEGER DEFAULT 0');
        console.log('[MIGRATION] Added has_beam_configuration column to bom_records');
      } catch (err) {
        if (!err.message.includes('duplicate column name')) {
          console.error('[MIGRATION] Error adding has_beam_configuration column:', err.message);
        }
      }

      await db.run(`
        UPDATE bom_records
           SET has_beam_configuration = 1
         WHERE has_beam_configuration IS NULL
           AND beam_configuration_json IS NOT NULL
           AND TRIM(beam_configuration_json) <> ''
      `);

      await db.run(`
        UPDATE bom_records
           SET has_beam_configuration = COALESCE(has_beam_configuration, 0)
      `);

      // Migration: Add recipe_approved column if it doesn't exist
      try {
        await db.run("ALTER TABLE bom_records ADD COLUMN recipe_approved TEXT DEFAULT 'Yes'");
        console.log('[MIGRATION] Added recipe_approved column to bom_records');
      } catch (err) {
        if (!err.message.includes('duplicate column name')) {
          console.error('[MIGRATION] Error adding recipe_approved column:', err.message);
        }
      };

      // One-time backfill for legacy records: mark existing records as approved.
      await db.run("UPDATE bom_records SET recipe_approved = 'Yes' WHERE recipe_approved IS NULL OR TRIM(recipe_approved) = ''");

      // Migration: Add approval_decision column if it doesn't exist
      try {
        await db.run("ALTER TABLE bom_records ADD COLUMN approval_decision TEXT DEFAULT 'Approved'");
        console.log('[MIGRATION] Added approval_decision column to bom_records');
      } catch (err) {
        if (!err.message.includes('duplicate column name')) {
          console.error('[MIGRATION] Error adding approval_decision column:', err.message);
        }
      }

      // Migration: Add approval_comment column if it doesn't exist
      try {
        await db.run("ALTER TABLE bom_records ADD COLUMN approval_comment TEXT");
        console.log('[MIGRATION] Added approval_comment column to bom_records');
      } catch (err) {
        if (!err.message.includes('duplicate column name')) {
          console.error('[MIGRATION] Error adding approval_comment column:', err.message);
        }
      }

      // Migration: Add approval_reviewed_by column if it doesn't exist
      try {
        await db.run("ALTER TABLE bom_records ADD COLUMN approval_reviewed_by TEXT");
        console.log('[MIGRATION] Added approval_reviewed_by column to bom_records');
      } catch (err) {
        if (!err.message.includes('duplicate column name')) {
          console.error('[MIGRATION] Error adding approval_reviewed_by column:', err.message);
        }
      }

      // Migration: Add approval_reviewed_at column if it doesn't exist
      try {
        await db.run("ALTER TABLE bom_records ADD COLUMN approval_reviewed_at DATETIME");
        console.log('[MIGRATION] Added approval_reviewed_at column to bom_records');
      } catch (err) {
        if (!err.message.includes('duplicate column name')) {
          console.error('[MIGRATION] Error adding approval_reviewed_at column:', err.message);
        }
      }

      await db.run("UPDATE bom_records SET approval_decision = 'Approved' WHERE recipe_approved = 'Yes' AND (approval_decision IS NULL OR TRIM(approval_decision) = '')");
      await db.run("UPDATE bom_records SET approval_decision = 'Pending' WHERE recipe_approved = 'No' AND (approval_decision IS NULL OR TRIM(approval_decision) = '' OR LOWER(TRIM(approval_decision)) = 'approved')");

      await db.run(`
        CREATE TABLE IF NOT EXISTS bom_record_materials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          record_id INTEGER NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          material_label TEXT NOT NULL,
          material_name TEXT NOT NULL,
          percentage REAL NOT NULL,
          FOREIGN KEY (record_id) REFERENCES bom_records(id) ON DELETE CASCADE
        )
      `);

      await db.run(`
        CREATE TABLE IF NOT EXISTS recipe_approval_region_assignments (
          user_id INTEGER NOT NULL,
          region TEXT NOT NULL,
          PRIMARY KEY (user_id, region)
        )
      `);
    })();
  }
  return bomRecordStoreInitPromise;
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

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

app.get("/bom-recipe-browser", (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "src", "frontend", "bom-recipe-browser.html");
    console.log("[ROUTE] GET /bom-recipe-browser - Serving:", filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("[ERROR] Failed to send bom-recipe-browser.html:", err);
        next(err);
      }
    });
  } catch (err) {
    console.error("[ERROR] BOM recipe browser route error:", err);
    next(err);
  }
});

app.get("/recipe-edit-clone", (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "src", "frontend", "recipe-edit-clone.html");
    console.log("[ROUTE] GET /recipe-edit-clone - Serving:", filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("[ERROR] Failed to send recipe-edit-clone.html:", err);
        next(err);
      }
    });
  } catch (err) {
    console.error("[ERROR] Recipe edit/clone route error:", err);
    next(err);
  }
});

app.get("/recipe-approval", (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "src", "frontend", "recipe-approval.html");
    console.log("[ROUTE] GET /recipe-approval - Serving:", filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("[ERROR] Failed to send recipe-approval.html:", err);
        next(err);
      }
    });
  } catch (err) {
    console.error("[ERROR] Recipe approval route error:", err);
    next(err);
  }
});

app.get("/rm-prices", (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "src", "frontend", "rm-prices.html");
    console.log("[ROUTE] GET /rm-prices - Serving:", filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("[ERROR] Failed to send rm-prices.html:", err);
        next(err);
      }
    });
  } catch (err) {
    console.error("[ERROR] RM prices route error:", err);
    next(err);
  }
});

app.get("/rm-prices/availability", (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "src", "frontend", "rm-price-availability.html");
    console.log("[ROUTE] GET /rm-prices/availability - Serving:", filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("[ERROR] Failed to send rm-price-availability.html:", err);
        next(err);
      }
    });
  } catch (err) {
    console.error("[ERROR] RM price availability route error:", err);
    next(err);
  }
});

app.get("/rm-prices/roll", (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "src", "frontend", "rm-prices-roll.html");
    console.log("[ROUTE] GET /rm-prices/roll - Serving:", filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("[ERROR] Failed to send rm-prices-roll.html:", err);
        next(err);
      }
    });
  } catch (err) {
    console.error("[ERROR] RM prices roll route error:", err);
    next(err);
  }
});

app.get('/rm-prices/remove', (req, res, next) => {
  try {
    const filePath = path.join(__dirname, 'src', 'frontend', 'rm-prices-remove.html');
    console.log('[ROUTE] GET /rm-prices/remove - Serving:', filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('[ERROR] Failed to send rm-prices-remove.html:', err);
        next(err);
      }
    });
  } catch (err) {
    console.error('[ERROR] RM prices remove route error:', err);
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

app.get("/fx-rates", (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "src", "frontend", "fx-rates-management.html");
    console.log("[ROUTE] GET /fx-rates - Serving:", filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("[ERROR] Failed to send fx-rates-management.html:", err);
        next(err);
      }
    });
  } catch (err) {
    console.error("[ERROR] FX rates route error:", err);
    next(err);
  }
});

app.get("/line-rates", (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "src", "frontend", "line-rates-management.html");
    console.log("[ROUTE] GET /line-rates - Serving:", filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("[ERROR] Failed to send line-rates-management.html:", err);
        next(err);
      }
    });
  } catch (err) {
    console.error("[ERROR] Line rates route error:", err);
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

// Serve xlsx browser bundle locally (avoid CDN dependency)
app.get('/vendor/xlsx.full.min.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'));
});

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

app.get("/api/auth/me/access-permissions", auth.authMiddleware, async (req, res) => {
  try {
    const pagePermissions = {};

    for (const page of ACCESS_PERMISSION_PAGES) {
      pagePermissions[page.key] = {
        read: await hasPagePermission(req.user.id, page.key, "read"),
        modify: await hasPagePermission(req.user.id, page.key, "modify")
      };
    }

    res.json({ pages: pagePermissions });
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

    // Notification failure should not block request creation.
    const mailResult = await sendAccessRequestSubmittedEmail({ ...result, reason });
    if (!mailResult.sent) {
      console.warn('Access request admin notification was not sent:', mailResult.reason || 'unknown_reason');
    }

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

app.get('/api/admin/access-requests/pending-count', auth.authMiddleware, async (req, res) => {
  try {
    const canManageUsers = auth.hasPermission(req.user.role, 'user:manage');
    let canReadAdminAccessPage = false;

    if (!canManageUsers) {
      canReadAdminAccessPage = await hasPagePermission(req.user.id, 'admin-access', 'read');
    }

    if (!canManageUsers && !canReadAdminAccessPage) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const pendingCount = await auth.getPendingAccessRequestsCount();
    res.json({ pendingCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve access request (admin only)
app.post("/api/admin/access-requests/:id/approve", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const { groupId } = req.body || {};
    const result = await auth.approveAccessRequest(req.params.id, req.user.id, groupId || null);
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

// Delete denied access request (admin only)
app.delete('/api/admin/access-requests/:id', auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const result = await auth.deleteDeniedAccessRequest(req.params.id, req.user.id);
    res.json({
      success: true,
      message: 'Denied access request deleted.',
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
    await auth.auditLog(req.user.id, 'GROUP_CREATED', 'groups', {
      groupId: group.id,
      groupName: group.name
    });
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
    const { name, description, permissions } = req.body;
    const hasPermissionsPayload = Object.prototype.hasOwnProperty.call(req.body || {}, "permissions");
    const group = await auth.updateGroup(
      req.params.id,
      name,
      description,
      hasPermissionsPayload ? permissions : null
    );

    await auth.auditLog(req.user.id, 'GROUP_UPDATED', 'groups', {
      groupId: group.id,
      groupName: group.name,
      permissionsUpdated: hasPermissionsPayload
    });

    res.json({
      success: true,
      message: 'Group updated successfully.',
      group
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get("/api/admin/access-permissions/matrix", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const groups = await auth.getGroups();
    const matrix = groups.map((group) => buildAccessMatrixRow(group));

    res.json({
      pages: ACCESS_PERMISSION_PAGES,
      matrix
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put("/api/admin/groups/:id/access-permissions", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const groupId = req.params.id;
    const { pagePermissions } = req.body || {};

    if (!pagePermissions || typeof pagePermissions !== "object") {
      return res.status(400).json({ success: false, error: "pagePermissions object is required" });
    }

    const groups = await auth.getGroups();
    const existingGroup = groups.find((group) => String(group.id) === String(groupId));
    if (!existingGroup) {
      return res.status(404).json({ success: false, error: "Group not found" });
    }

    const nonPagePermissions = getPermissionsWithoutPageKeys(existingGroup.permissions);
    const pagePermissionTokens = buildPagePermissionTokens(pagePermissions);
    const mergedPermissions = Array.from(new Set([...nonPagePermissions, ...pagePermissionTokens]));

    const updatedGroup = await auth.updateGroup(
      groupId,
      existingGroup.name,
      existingGroup.description || "",
      mergedPermissions
    );

    await auth.auditLog(req.user.id, 'GROUP_ACCESS_PERMISSIONS_UPDATED', 'groups', {
      groupId: updatedGroup.id,
      groupName: updatedGroup.name
    });

    res.json({
      success: true,
      message: "Access permissions updated successfully.",
      group: buildAccessMatrixRow(updatedGroup)
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Delete group (admin only)
app.delete("/api/admin/groups/:id", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const groupId = req.params.id;
    const groups = await auth.getGroups();
    const group = groups.find((item) => String(item.id) === String(groupId));
    const result = await auth.deleteGroup(req.params.id);

    await auth.auditLog(req.user.id, 'GROUP_DELETED', 'groups', {
      groupId,
      groupName: group ? group.name : null
    });

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

    await auth.auditLog(req.user.id, 'USER_CREATED_BY_ADMIN', 'users', {
      userId: user.id,
      email: user.email,
      name: user.name,
      groupId: user.groupId || null
    });

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
    const targetUserId = req.params.userId;
    const user = await auth.updateUser(req.params.userId, email, fullName, password);

    await auth.auditLog(req.user.id, 'USER_UPDATED_BY_ADMIN', 'users', {
      userId: targetUserId,
      email: user.email,
      name: user.name,
      passwordUpdated: !!password
    });

    res.json({
      success: true,
      message: 'User updated successfully.',
      user
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Move user from one group to another (admin only)
app.post('/api/admin/users/:userId/move-group', auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const userId = req.params.userId;
    const { fromGroupId, toGroupId } = req.body || {};

    if (!fromGroupId || !toGroupId) {
      return res.status(400).json({ success: false, error: 'fromGroupId and toGroupId are required' });
    }

    const [user, groups] = await Promise.all([
      auth.getCurrentUser(userId).catch(() => null),
      auth.getGroups().catch(() => [])
    ]);

    const sourceGroup = (groups || []).find((item) => String(item.id) === String(fromGroupId));
    const targetGroup = (groups || []).find((item) => String(item.id) === String(toGroupId));

    const result = await auth.moveUserToGroup(userId, fromGroupId, toGroupId);

    await auth.auditLog(req.user.id, 'USER_MOVED_BETWEEN_GROUPS', 'users', {
      userId,
      userEmail: user ? user.email : null,
      fromGroupId,
      fromGroupName: sourceGroup ? sourceGroup.name : null,
      toGroupId,
      toGroupName: targetGroup ? targetGroup.name : null
    });

    return res.json({
      success: true,
      message: 'User moved between groups successfully.',
      result
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// Delete user (admin only)
app.delete('/api/admin/users/:userId', auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    if (String(targetUserId) === String(req.user.id)) {
      return res.status(400).json({ success: false, error: 'You cannot delete your own account.' });
    }

    const result = await auth.deleteUser(targetUserId);

    await auth.auditLog(req.user.id, 'USER_DELETED_BY_ADMIN', 'users', {
      userId: result.id,
      email: result.email,
      name: result.name,
      role: result.role
    });

    return res.json({
      success: true,
      message: 'User deleted successfully.',
      result
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
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

app.get("/api/polymer-indexes", auth.authMiddleware, async (req, res) => {
  try {
    const indexes = await polymerIndexes.getIndexes(false);
    res.json({ success: true, indexes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/polymer-indexes/data/by-week", auth.authMiddleware, async (req, res) => {
  try {
    const startYear = Number(req.query.startYear) || 2020;
    const endYear = Number(req.query.endYear) || 2026;
    const data = await polymerIndexes.getDataByWeek({ startYear, endYear });
    res.json({ success: true, weeks: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/admin/polymer-indexes", auth.authMiddleware, requirePolymerIndexManage, async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const indexes = await polymerIndexes.getIndexes(includeInactive);
    res.json({ success: true, indexes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/admin/polymer-indexes", auth.authMiddleware, requirePolymerIndexManage, async (req, res) => {
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

app.put("/api/admin/polymer-indexes/:id", auth.authMiddleware, requirePolymerIndexManage, async (req, res) => {
  try {
    const payload = req.body || {};
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

app.delete("/api/admin/polymer-indexes/:id", auth.authMiddleware, requirePolymerIndexManage, async (req, res) => {
  try {
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

app.get("/api/admin/polymer-indexes/:id/values", auth.authMiddleware, requirePolymerIndexManage, async (req, res) => {
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

app.post("/api/admin/polymer-indexes/:id/values", auth.authMiddleware, requirePolymerIndexManage, async (req, res) => {
  try {
    const value = await polymerIndexes.upsertIndexValue(req.params.id, req.body || {}, req.user.id);
    res.status(201).json({ success: true, value });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/api/admin/polymer-indexes/import", auth.authMiddleware, requirePolymerIndexManage, async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const result = await polymerIndexes.bulkImport(rows, req.user.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get("/api/admin/polymer-indexes/reminders/due", auth.authMiddleware, requirePolymerIndexManage, async (req, res) => {
  try {
    const due = await polymerIndexes.getDueReminders(new Date());
    res.json({ success: true, due });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/admin/polymer-indexes/data/by-week", auth.authMiddleware, requirePolymerIndexManage, async (req, res) => {
  try {
    const startYear = Number(req.query.startYear) || 2020;
    const endYear = Number(req.query.endYear) || 2026;
    const data = await polymerIndexes.getDataByWeek({ startYear, endYear });
    res.json({ success: true, weeks: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/admin/polymer-indexes/data/all", auth.authMiddleware, requirePolymerIndexManage, async (req, res) => {
  try {
    const result = await polymerIndexes.clearAllIndexValues();
    await auth.auditLog(req.user.id, 'DELETE_ALL_INDEX_VALUES', 'polymer_index_values', null, { deletedCount: result.deletedCount });
    res.json({ success: true, message: `Successfully deleted ${result.deletedCount} index values`, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/admin/polymer-indexes/recalculate-mid", auth.authMiddleware, requirePolymerIndexManage, async (req, res) => {
  try {
    const result = await polymerIndexes.recalculateAllMidValues(req.user.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Debug endpoints
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

// BOM Calculator endpoints
app.get("/api/bom/lists", async (req, res) => {
  try {
    const materialLists = await getMaterialListValues();
    res.json(materialLists);
  } catch (err) {
    console.error("Error loading BOM material lists:", err);
    res.status(500).json({ error: "Failed to load BOM lists", details: err.message });
  }
});

app.get("/api/bom/description-lists", async (req, res) => {
  try {
    const lists = await getDescriptionListValues();
    res.json({ lists });
  } catch (err) {
    console.error("Error loading BOM description lists:", err);
    res.status(500).json({ error: "Failed to load description lists", details: err.message });
  }
});

app.put("/api/bom/description-lists/:listKey", async (req, res) => {
  try {
    const { listKey } = req.params;
    const { values, renamePairs } = req.body || {};

    if (!Array.isArray(values)) {
      return res.status(400).json({ error: "Request body must include a values array." });
    }

    if (hasCaseInsensitiveDuplicates(values)) {
      return res.status(400).json({ error: "Duplicate values are not allowed." });
    }

    const normalized = normalizeUniqueStrings(values);
    if (normalized.length === 0) {
      return res.status(400).json({ error: "List cannot be empty." });
    }

    const updatedValues = await saveDescriptionListValuesWithoutDeletion(listKey, normalized, renamePairs);
    res.json({ success: true, values: updatedValues });
  } catch (err) {
    if (err.code === "DESCRIPTION_LIST_UNKNOWN") {
      return res.status(404).json({ error: "Description list was not found." });
    }

    if (err.code === "DESCRIPTION_LIST_READONLY") {
      return res.status(400).json({ error: "This list is read-only and cannot be edited." });
    }

    if (err.code === "DESCRIPTION_LIST_REMOVAL_NOT_ALLOWED") {
      return res.status(400).json({
        error: "Removing existing values is not allowed. You can rename existing entries or add new ones."
      });
    }

    if (err.message && err.message.includes("UNIQUE constraint failed")) {
      return res.status(400).json({ error: "Duplicate values are not allowed." });
    }

    console.error("Error saving BOM description list:", err);
    res.status(500).json({ error: "Failed to save description list", details: err.message });
  }
});

app.get("/api/bom/customers", async (req, res) => {
  try {
    const customers = await getCustomerNames();
    res.json({ customers });
  } catch (err) {
    console.error("Error loading customer list from database:", err);
    res.status(500).json({ error: "Failed to load customer list", details: err.message });
  }
});

app.put("/api/bom/customers", async (req, res) => {
  try {
    const { customers, renamePairs } = req.body || {};
    if (!Array.isArray(customers)) {
      return res.status(400).json({ error: "Request body must include a customers array." });
    }

    if (hasCaseInsensitiveDuplicates(customers)) {
      return res.status(400).json({ error: "Duplicate customer names are not allowed." });
    }

    const normalized = normalizeUniqueStrings(customers);
    if (normalized.length === 0) {
      return res.status(400).json({ error: "Customer list cannot be empty." });
    }

    const savedCustomers = await saveCustomerNamesWithoutDeletion(normalized, renamePairs);
    res.json({ success: true, customers: savedCustomers });
  } catch (err) {
    if (err.code === "CUSTOMER_REMOVAL_NOT_ALLOWED") {
      return res.status(400).json({
        error: "Removing existing customers is not allowed. You can rename existing entries or add new ones."
      });
    }

    if (err.message && err.message.includes("UNIQUE constraint failed")) {
      return res.status(400).json({ error: "Duplicate customer names are not allowed." });
    }

    console.error("Error saving customer list to database:", err);
    res.status(500).json({ error: "Failed to save customer list", details: err.message });
  }
});

// Raw Material Prices endpoints
app.get("/api/rm-prices/sheet", auth.authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const year = req.query.year ? Number(req.query.year) : now.getFullYear();
    const month = req.query.month ? Number(req.query.month) : (now.getMonth() + 1);
    const plant = req.query.plant;

    const sheet = await rmPrices.getMonthlyPlantPriceSheet({ plant, year, month });
    res.json(sheet);
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to load raw material price sheet" });
  }
});

app.get("/api/rm-prices/current-for-line", auth.authMiddleware, async (req, res) => {
  try {
    const { line } = req.query;
    if (!line) {
      return res.status(400).json({ error: "line query parameter is required" });
    }

    const payload = await rmPrices.getCurrentPricesForLine({
      line,
      year: req.query.year ? Number(req.query.year) : undefined,
      month: req.query.month ? Number(req.query.month) : undefined
    });

    res.json(payload);
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to load current prices for line" });
  }
});

app.get("/api/rm-prices/formulas", auth.authMiddleware, async (req, res) => {
  try {
    const formulas = await rmPrices.listFormulas();
    res.json({ formulas });
  } catch (err) {
    res.status(500).json({ error: "Failed to load formulas", details: err.message });
  }
});

app.get("/api/rm-prices/plant-materials", auth.authMiddleware, async (req, res) => {
  try {
    const rows = await rmPrices.getPlantMaterials();
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load plant materials", details: err.message });
  }
});

app.post("/api/rm-prices", auth.authMiddleware, requireRmPricesManage, async (req, res) => {
  try {
    const { material_list_key, material_name, plant, year, month, price, currency } = req.body || {};

    const result = await rmPrices.upsertManualPrice({
      materialListKey: material_list_key,
      materialName: material_name,
      plant,
      year,
      month,
      price,
      currency,
      userId: req.user.id
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to save price" });
  }
});

app.post("/api/rm-prices/import", auth.authMiddleware, requireRmPricesManage, async (req, res) => {
  try {
    const { rows } = req.body || {};
    const result = await rmPrices.importPrices(rows, req.user.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to import prices" });
  }
});

app.post("/api/rm-prices/import-non-polymer", auth.authMiddleware, requireRmPricesManage, async (req, res) => {
  try {
    const { rows } = req.body || {};
    const result = await rmPrices.importNonPolymerPrices(rows, req.user.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to import non-polymer prices" });
  }
});

app.post("/api/rm-prices/calculate-polymer", auth.authMiddleware, requireRmPricesManage, async (req, res) => {
  try {
    const now = new Date();
    const plant = req.body?.plant || req.query?.plant;
    const year = req.body?.year ?? req.query?.year ?? now.getFullYear();
    const month = req.body?.month ?? req.query?.month ?? (now.getMonth() + 1);

    const result = await rmPrices.calculatePolymerPrices({
      plant,
      year: Number(year),
      month: Number(month),
      userId: req.user.id
    });

    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to calculate polymer prices" });
  }
});

app.post("/api/rm-prices/roll", auth.authMiddleware, requireRmPricesManage, async (req, res) => {
  try {
    const { from_year, from_month, to_year, to_month, plant, material_list_key, overwrite } = req.body || {};
    const result = await rmPrices.rollPrices({
      fromYear: Number(from_year),
      fromMonth: Number(from_month),
      toYear: Number(to_year),
      toMonth: Number(to_month),
      plant,
      materialListKey: material_list_key || null,
      overwrite: !!overwrite,
      userId: req.user.id
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to roll prices" });
  }
});

app.get('/api/rm-prices/remove/list', auth.authMiddleware, requireRmPricesManage, async (req, res) => {
  try {
    const now = new Date();
    const year = req.query.year ? Number(req.query.year) : now.getFullYear();
    const month = req.query.month ? Number(req.query.month) : (now.getMonth() + 1);
    const plant = req.query.plant;
    const material_list_key = req.query.material_list_key || null;

    const result = await rmPrices.listExactPricesForPeriod({
      plant,
      year,
      month,
      materialListKey: material_list_key
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to load removable prices' });
  }
});

app.delete('/api/rm-prices/remove', auth.authMiddleware, requireRmPricesManage, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;

    if (ids && ids.length > 0) {
      const result = await rmPrices.deleteExactPricesByIds(ids);
      return res.json({ success: true, mode: 'ids', result });
    }

    const { plant, year, month, material_list_key } = req.body || {};
    const result = await rmPrices.deleteExactPricesForPeriod({
      plant,
      year: Number(year),
      month: Number(month),
      materialListKey: material_list_key || null
    });
    return res.json({ success: true, mode: 'filter', result });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to delete prices' });
  }
});

app.get("/api/line-rates/years", auth.authMiddleware, async (req, res) => {
  try {
    const years = await lineRatesDb.listLineRateYears();
    res.json({ years });
  } catch (err) {
    res.status(500).json({ error: "Failed to load line rate years", details: err.message });
  }
});

app.get("/api/line-rates/:year", auth.authMiddleware, async (req, res) => {
  try {
    const year = parseOptionalYear(req.params.year);
    if (!year) {
      return res.status(400).json({ error: "Invalid year" });
    }

    const rows = await lineRatesDb.getLineRatesForYear(year);
    res.json({ year, rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load line rates", details: err.message });
  }
});

app.post("/api/line-rates/import", auth.authMiddleware, requireLineRatesManage, async (req, res) => {
  try {
    const { year, raw, rows, overwrite } = req.body || {};
    const normalizedYear = parseOptionalYear(year);
    if (!normalizedYear) {
      return res.status(400).json({ error: "Invalid year" });
    }

    let parsedRows = [];
    if (Array.isArray(rows) && rows.length) {
      parsedRows = rows;
    } else if (Array.isArray(raw) && raw.length) {
      parsedRows = parseLineRatesMatrix(raw);
    } else {
      return res.status(400).json({ error: "Import payload must include raw matrix data or parsed rows" });
    }

    const result = await lineRatesDb.importLineRates({
      year: normalizedYear,
      lines: parsedRows,
      overwrite: !!overwrite,
      userId: req.user.id
    });

    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to import line rates" });
  }
});

app.post("/api/rm-prices/formulas", auth.authMiddleware, requireRmPricesManage, async (req, res) => {
  try {
    const result = await rmPrices.upsertFormula(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to save formula" });
  }
});

app.delete("/api/rm-prices/formulas/:id", auth.authMiddleware, requireRmPricesManage, async (req, res) => {
  try {
    const result = await rmPrices.deleteFormula(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to delete formula" });
  }
});

app.put("/api/rm-prices/plant-materials", auth.authMiddleware, requireRmPricesManage, async (req, res) => {
  try {
    const { assignments } = req.body || {};
    const result = await rmPrices.updatePlantMaterials(assignments);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to update plant material assignments" });
  }
});

app.post("/api/rm-prices/materials/add", auth.authMiddleware, requireRmPricesManage, async (req, res) => {
  try {
    const { material_list_key, material_name, numeric_value, plants } = req.body || {};
    const result = await rmPrices.addMaterialToList({
      materialListKey: material_list_key,
      materialName: material_name,
      numericValue: numeric_value,
      plants
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to add material" });
  }
});

app.delete("/api/rm-prices/materials", auth.authMiddleware, requireRmPricesManage, async (req, res) => {
  try {
    const { material_list_key, material_name } = req.body || {};
    const result = await rmPrices.deleteMaterialEverywhere({
      materialListKey: material_list_key,
      materialName: material_name
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to delete material" });
  }
});

// ==================== FX RATES MANAGEMENT ====================

// Get available FX rate periods
app.get("/api/fx-rates/periods", auth.authMiddleware, async (req, res) => {
  try {
    const periods = await fxRatesDb.getAvailableFxPeriods();
    res.json({ periods });
  } catch (err) {
    res.status(500).json({ error: "Failed to load FX periods", details: err.message });
  }
});

// Get FX rates for a specific period
app.get("/api/fx-rates/:year/:month", auth.authMiddleware, async (req, res) => {
  try {
    const { year, month } = req.params;
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (!Number.isFinite(yearNum) || !Number.isFinite(monthNum)) {
      return res.status(400).json({ error: "Invalid year or month" });
    }
    
    const rates = await fxRatesDb.getFxRatesForPeriod(yearNum, monthNum);
    res.json({ rates });
  } catch (err) {
    res.status(500).json({ error: "Failed to load FX rates", details: err.message });
  }
});

// Get FX rates matrix for a specific year (Budget + months 1..12)
app.get("/api/fx-rates-matrix/:year", auth.authMiddleware, async (req, res) => {
  try {
    const yearNum = parseInt(req.params.year, 10);
    if (!Number.isFinite(yearNum) || yearNum < 2000) {
      return res.status(400).json({ error: "Invalid year" });
    }

    const records = await fxRatesDb.getFxRatesForYear(yearNum);
    const monthSlots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    const currencies = new Set();
    const byMonth = new Map();

    for (const rec of records) {
      const pair = String(rec.currency_pair || '').trim().toUpperCase();
      if (!/^[A-Z]{6}$/.test(pair)) continue;

      const month = Number(rec.month);
      if (!Number.isFinite(month) || month < 0 || month > 12) continue;

      const rate = Number(rec.rate);
      if (!Number.isFinite(rate) || rate <= 0) continue;

      const c1 = pair.slice(0, 3);
      const c2 = pair.slice(3, 6);
      currencies.add(c1);
      currencies.add(c2);

      if (!byMonth.has(month)) {
        byMonth.set(month, {
          rates: new Map(),
          meta: new Map()
        });
      }

      const slot = byMonth.get(month);
      if (!slot.rates.has(pair)) {
        slot.rates.set(pair, rate);
        slot.meta.set(pair, {
          source: 'imported',
          created_at: rec.created_at,
          updated_at: rec.updated_at
        });
      }
    }

    const matrixCurrencies = ['EUR', 'USD', 'CZK', 'ZAR'];
    const discoveredCurrencies = new Set(Array.from(currencies));
    const allCurrencies = matrixCurrencies.filter((ccy) => discoveredCurrencies.has(ccy));

    function findPathRate(from, to, edgeMap) {
      if (from === to) return { rate: 1, steps: 0 };
      const queue = [{ ccy: from, rate: 1, steps: 0 }];
      const visited = new Set([from]);
      let head = 0;

      while (head < queue.length) {
        const current = queue[head++];
        const edges = edgeMap.get(current.ccy) || [];

        for (const edge of edges) {
          if (visited.has(edge.to)) continue;
          const nextRate = current.rate * edge.rate;
          if (!Number.isFinite(nextRate) || nextRate <= 0) continue;

          if (edge.to === to) {
            return { rate: nextRate, steps: current.steps + 1 };
          }

          visited.add(edge.to);
          queue.push({ ccy: edge.to, rate: nextRate, steps: current.steps + 1 });
        }
      }

      return null;
    }

    function resolvePairRate(month, from, to) {
      const pair = from + to;
      const reverse = to + from;
      const slot = byMonth.get(month);
      if (!slot) return null;

      const direct = slot.rates.get(pair);
      if (Number.isFinite(direct) && direct > 0) {
        return {
          rate: direct,
          source: slot.meta.get(pair)?.source || 'imported',
          created_at: slot.meta.get(pair)?.created_at || null
        };
      }

      const rev = slot.rates.get(reverse);
      if (Number.isFinite(rev) && rev > 0) {
        return {
          rate: 1 / rev,
          source: 'inverse',
          created_at: slot.meta.get(reverse)?.created_at || null
        };
      }

      const edgeMap = new Map();
      for (const [storedPair, storedRate] of slot.rates.entries()) {
        if (!Number.isFinite(storedRate) || storedRate <= 0) continue;
        const a = storedPair.slice(0, 3);
        const b = storedPair.slice(3, 6);

        if (!edgeMap.has(a)) edgeMap.set(a, []);
        if (!edgeMap.has(b)) edgeMap.set(b, []);

        edgeMap.get(a).push({ to: b, rate: storedRate });
        edgeMap.get(b).push({ to: a, rate: 1 / storedRate });
      }

      const pathRate = findPathRate(from, to, edgeMap);
      if (!pathRate) return null;

      return {
        rate: pathRate.rate,
        source: pathRate.steps > 1 ? 'derived' : 'inverse',
        created_at: null
      };
    }

    const pairRows = [];
    for (let i = 0; i < allCurrencies.length; i++) {
      for (let j = 0; j < allCurrencies.length; j++) {
        const from = allCurrencies[i];
        const to = allCurrencies[j];
        if (!from || !to) continue;
        if (from === to) continue;

        const row = {
          currency1: from,
          currency2: to,
          currency_pair: from + to,
          budget: null,
          months: {},
          sources: {}
        };

        for (const month of monthSlots) {
          let resolved = resolvePairRate(month, from, to);

          // If budget rate is missing, fallback to the first available month in the year.
          if (month === 0 && !resolved) {
            for (let fallbackMonth = 1; fallbackMonth <= 12; fallbackMonth++) {
              const fallbackResolved = resolvePairRate(fallbackMonth, from, to);
              if (fallbackResolved) {
                resolved = {
                  ...fallbackResolved,
                  source: `budget-fallback-m${fallbackMonth}`
                };
                break;
              }
            }
          }

          const key = month === 0 ? 'budget' : String(month);
          const rounded = resolved && Number.isFinite(resolved.rate)
            ? Math.round(resolved.rate * 1000000) / 1000000
            : null;

          if (month === 0) row.budget = rounded;
          else row.months[key] = rounded;

          row.sources[key] = resolved ? resolved.source : null;
        }

        pairRows.push(row);
      }
    }

    const matrixCurrencySet = new Set(matrixCurrencies);
    const filteredRows = pairRows.filter((row) => (
      matrixCurrencySet.has(row.currency1) && matrixCurrencySet.has(row.currency2)
    ));
    const responseCurrencies = allCurrencies.filter((ccy) => matrixCurrencySet.has(ccy));

    res.json({
      year: yearNum,
      months: monthSlots,
      currencies: responseCurrencies,
      rows: filteredRows
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load FX matrix", details: err.message });
  }
});

// Import FX rates from file
app.post("/api/fx-rates/import", auth.authMiddleware, requireFxRatesManage, async (req, res) => {
  try {
    const { rows, overwrite } = req.body || {};
    
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No data to import" });
    }
    
    // Parse and group rates
    const normalized = fxRatesImport.normalizeFxRateData(rows);
    if (normalized.length === 0) {
      return res.status(400).json({ error: "No valid FX rate entries found in data" });
    }
    
    const grouped = fxRatesImport.groupByPeriod(normalized);
    const results = [];
    
    // Save each period
    for (const period of grouped) {
      // Check if period exists
      const exists = await fxRatesDb.fxRatesPeriodExists(period.year, period.month);
      
      if (exists && !overwrite) {
        const periodToken = period.month === 0 ? 'budget' : String(period.month).padStart(2, '0');
        results.push({
          period: `${period.year}-${periodToken}`,
          status: 'skipped',
          message: 'Period already exists, skipped to avoid overwrite'
        });
        continue;
      }
      
      const result = await fxRatesDb.saveFxRates(period.year, period.month, period.rates, overwrite);
      const periodToken = period.month === 0 ? 'budget' : String(period.month).padStart(2, '0');
      results.push({
        period: `${period.year}-${periodToken}`,
        ...result
      });
    }
    
    res.json({ success: true, results });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to import FX rates" });
  }
});

// Delete a single FX rate
app.delete("/api/fx-rates/:id", auth.authMiddleware, requireFxRatesManage, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await fxRatesDb.deleteFxRate(parseInt(id));
    
    if (!result.success) {
      return res.status(404).json({ error: "FX rate not found" });
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete FX rate", details: err.message });
  }
});

// ==================== BOM RECORD ENDPOINTS ====================

function normalizeText(value) {
  return (value ?? "").toString().trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function parsePositiveInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function parseCsvMultiValues(queryValue) {
  return toMultiValueArray(queryValue)
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function matchesFilterValue(sourceValue, acceptedValues) {
  if (!Array.isArray(acceptedValues) || acceptedValues.length === 0) {
    return true;
  }

  const source = normalizeLower(sourceValue);
  if (!source) return false;

  const accepted = new Set(acceptedValues.map((v) => normalizeLower(v)).filter(Boolean));
  return accepted.has(source);
}

function validateAndNormalizeBomMaterials(materials) {
  if (!Array.isArray(materials) || materials.length === 0) {
    const error = new Error("At least one BOM material row is required.");
    error.statusCode = 400;
    throw error;
  }

  const normalized = materials.map((raw, index) => {
    const percentage = Number(raw?.percentage);
    if (!Number.isFinite(percentage) || percentage < 0) {
      const error = new Error(`Material percentage is invalid at row ${index + 1}.`);
      error.statusCode = 400;
      throw error;
    }

    return {
      material_label: normalizeText(raw?.material_label),
      material_name: normalizeText(raw?.material_name),
      percentage,
      sort_order: Number.isFinite(Number(raw?.sort_order)) ? Number(raw.sort_order) : index
    };
  });

  // Validate total percentage of non-surfactant materials must equal 100%
  // (Surfactants evaporate during production, so they are excluded from percentage sum)
  const nonSurfactants = normalized.filter(mat => mat.material_label !== 'Surfactant');
  const total = nonSurfactants.reduce((sum, mat) => sum + mat.percentage, 0);

  if (Math.abs(total - 100) > 0.01) {
    const error = new Error(`BOM percentages (excluding surfactants) must sum to 100.00% (current total: ${total.toFixed(2)}%).`);
    error.statusCode = 400;
    throw error;
  }

  return normalized;
}

function validatePdIdOrThrow(pdIdRaw) {
  const pdId = normalizeText(pdIdRaw);
  if (!pdId) return "";
  if (!/^\d+$/.test(pdId)) {
    const error = new Error("PD ID must contain only numeric characters.");
    error.statusCode = 400;
    throw error;
  }
  return pdId;
}

const AUTO_PD_ID_START = 10000;

async function allocateNextBomPdId(startFrom = AUTO_PD_ID_START) {
  const floor = Number.isFinite(Number(startFrom)) ? Math.max(AUTO_PD_ID_START, Number(startFrom)) : AUTO_PD_ID_START;
  const rows = await db.all(`
    SELECT pd_id
    FROM bom_records
    WHERE pd_id IS NOT NULL
      AND trim(pd_id) != ''
  `);

  const used = new Set();
  for (const row of rows || []) {
    const value = normalizeText(row?.pd_id);
    if (!value || !/^\d+$/.test(value)) {
      continue;
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= floor) {
      used.add(numeric);
    }
  }

  let candidate = floor;
  while (used.has(candidate)) {
    candidate += 1;
  }

  return String(candidate);
}

async function findDuplicateSapLineRecord(sapIdRaw, lineRaw, excludeRecordId = null) {
  const sapId = normalizeText(sapIdRaw);
  const line = normalizeText(lineRaw);
  if (!sapId || !line) return null;

  if (Number.isFinite(Number(excludeRecordId))) {
    return db.get(
      `SELECT id, sap_id, line
       FROM bom_records
       WHERE lower(trim(coalesce(sap_id, ''))) = lower(trim(?))
         AND lower(trim(coalesce(line, ''))) = lower(trim(?))
         AND id != ?
       LIMIT 1`,
      [sapId, line, Number(excludeRecordId)]
    );
  }

  return db.get(
    `SELECT id, sap_id, line
     FROM bom_records
     WHERE lower(trim(coalesce(sap_id, ''))) = lower(trim(?))
       AND lower(trim(coalesce(line, ''))) = lower(trim(?))
     LIMIT 1`,
    [sapId, line]
  );
}

function requireBomRecordWrite(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  Promise.resolve()
    .then(async () => {
      if (auth.hasPermission(req.user.role, "user:manage")) {
        return true;
      }

      const [calculatorModify, recipeEditModify] = await Promise.all([
        hasPagePermission(req.user.id, "bom-calculator", "modify"),
        hasPagePermission(req.user.id, "recipe-edit-clone", "modify")
      ]);

      return calculatorModify || recipeEditModify;
    })
    .then((allowed) => {
      if (!allowed) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      return next();
    })
    .catch((err) => {
      console.error("bom record write permission check failed:", err);
      return res.status(500).json({ error: "Failed to verify permissions" });
    });
}

function requireBomRecordDelete(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!auth.hasPermission(req.user.role, "user:manage")) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  return next();
}

app.get("/api/bom/edit-clone/metadata", auth.authMiddleware, requireRecipeEditCloneRead, async (req, res) => {
  try {
    await ensureBomRecordStoreReady();
    const selectedYear = parseOptionalYear(req.query.year);
    const lines = await getLinesForYear(selectedYear);

    const [rows, customersPayload, descriptionListsPayload, materialListsPayload] = await Promise.all([
      db.all(`
        SELECT sap_id, pd_id, customer, market_segment, application, smms, mono_bico,
               structure, bico_ratio_desc, main_raw_mat, treatment, color, bonding,
               customer_bw, slit_width, author, line, recipe_approved
        FROM bom_records
        ORDER BY updated_at DESC, created_at DESC
      `),
      getCustomerNames(),
      getDescriptionListValues(),
      getMaterialListValues()
    ]);

    const toUnique = (values) => [...new Set((values || []).filter((v) => v !== null && v !== undefined && `${v}`.trim() !== ""))];

    const sapIds = toUnique(rows.map((r) => r.sap_id)).sort(compareValuesForDisplay);
    const pfnIds = toUnique(rows.map((r) => r.pd_id)).sort(compareValuesForDisplay);
    const customers = toUnique(rows.map((r) => r.customer)).sort(compareValuesForDisplay);
    const marketSegments = toUnique(rows.map((r) => r.market_segment)).sort(compareValuesForDisplay);
    const applications = toUnique(rows.map((r) => r.application)).sort(compareValuesForDisplay);
    const smsOptions = toUnique(rows.map((r) => r.smms)).sort(compareValuesForDisplay);
    const monoBicoOptions = toUnique(rows.map((r) => r.mono_bico)).sort(compareValuesForDisplay);
    const structures = toUnique(rows.map((r) => r.structure)).sort(compareValuesForDisplay);
    const bicoRatios = toUnique(rows.map((r) => r.bico_ratio_desc)).sort(compareValuesForDisplay);
    const mainRawMats = toUnique(rows.map((r) => r.main_raw_mat)).sort(compareValuesForDisplay);
    const treatments = toUnique(rows.map((r) => r.treatment)).sort(compareValuesForDisplay);
    const colors = toUnique(rows.map((r) => r.color)).sort(compareValuesForDisplay);
    const bondings = toUnique(rows.map((r) => r.bonding)).sort(compareValuesForDisplay);
    const basisWeights = toUnique(rows.map((r) => r.customer_bw)).sort((a, b) => Number(a) - Number(b));
    const slitWidths = toUnique(rows.map((r) => r.slit_width)).sort((a, b) => Number(a) - Number(b));
    const authors = toUnique(rows.map((r) => r.author)).sort(compareValuesForDisplay);
    const lineIds = toUnique(rows.map((r) => r.line)).sort(compareValuesForDisplay);
    const recipeApprovedValues = toUnique(rows.map((r) => r.recipe_approved || "No")).sort(compareValuesForDisplay);
    const countries = toUnique(
      rows.map((r) => {
        const key = normalizeText(r.line);
        return key ? (lines[key]?.country || "") : "";
      })
    ).sort(compareValuesForDisplay);

    res.json({
      filters: {
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
        lineIds,
        countries,
        recipeApprovedValues
      },
      editor: {
        customers: normalizeUniqueStrings(customersPayload || []),
        descriptionLists: descriptionListsPayload || {},
        materialLists: materialListsPayload || {},
        lineIds,
        monoBicoOptions,
        structures,
        bicoRatios,
        mainRawMats,
        colors,
        bondings,
        targetUnits: ["tons", "kg"]
      }
    });
  } catch (err) {
    console.error("Error loading recipe edit/clone metadata:", err);
    res.status(500).json({ error: "Failed to load recipe edit/clone metadata", details: err.message });
  }
});

app.get("/api/bom/edit-clone/rows", auth.authMiddleware, requireRecipeEditCloneRead, async (req, res) => {
  try {
    await ensureBomRecordStoreReady();
    const selectedYear = parseOptionalYear(req.query.year);
    const lines = await getLinesForYear(selectedYear);

    const filters = {
      sapId: parseCsvMultiValues(req.query.sapId),
      pfnId: parseCsvMultiValues(req.query.pfnId),
      customer: parseCsvMultiValues(req.query.customer),
      marketSegment: parseCsvMultiValues(req.query.marketSegment),
      application: parseCsvMultiValues(req.query.application),
      s_sms: parseCsvMultiValues(req.query.s_sms),
      bonding: parseCsvMultiValues(req.query.bonding),
      basisWeight: parseCsvMultiValues(req.query.basisWeight),
      slitWidth: parseCsvMultiValues(req.query.slitWidth),
      treatment: parseCsvMultiValues(req.query.treatment),
      author: parseCsvMultiValues(req.query.author),
      lineId: parseCsvMultiValues(req.query.lineId),
      country: parseCsvMultiValues(req.query.country),
      recipeApproved: parseCsvMultiValues(req.query.recipeApproved)
    };

    const [records, materialRows] = await Promise.all([
      db.all(`SELECT * FROM bom_records ORDER BY updated_at DESC, created_at DESC`),
      db.all(`
        SELECT record_id, material_label, material_name, percentage, sort_order
        FROM bom_record_materials
        ORDER BY record_id, sort_order
      `)
    ]);

    const materialsByRecord = new Map();
    for (const row of materialRows || []) {
      if (!materialsByRecord.has(row.record_id)) {
        materialsByRecord.set(row.record_id, []);
      }
      materialsByRecord.get(row.record_id).push({
        material_label: row.material_label,
        material_name: row.material_name,
        percentage: Number(row.percentage) || 0,
        sort_order: Number(row.sort_order) || 0
      });
    }

    const filtered = (records || []).filter((record) => {
      const lineKey = normalizeText(record.line);
      const country = lineKey ? (lines[lineKey]?.country || "") : "";

      return (
        matchesFilterValue(record.sap_id, filters.sapId) &&
        matchesFilterValue(record.pd_id, filters.pfnId) &&
        matchesFilterValue(record.customer, filters.customer) &&
        matchesFilterValue(record.market_segment, filters.marketSegment) &&
        matchesFilterValue(record.application, filters.application) &&
        matchesFilterValue(record.smms, filters.s_sms) &&
        matchesFilterValue(record.bonding, filters.bonding) &&
        matchesFilterValue(record.customer_bw, filters.basisWeight) &&
        matchesFilterValue(record.slit_width, filters.slitWidth) &&
        matchesFilterValue(record.treatment, filters.treatment) &&
        matchesFilterValue(record.author, filters.author) &&
        matchesFilterValue(record.line, filters.lineId) &&
        matchesFilterValue(country, filters.country) &&
        matchesFilterValue(record.recipe_approved || "No", filters.recipeApproved)
      );
    }).map((record) => {
      const materials = materialsByRecord.get(record.id) || [];
      const total = materials.reduce((sum, m) => sum + (Number(m.percentage) || 0), 0);
      const lineKey = normalizeText(record.line);

      return {
        ...record,
        country: lineKey ? (lines[lineKey]?.country || "") : "",
        materials,
        material_total_percent: Math.round(total * 10000) / 10000
      };
    });

    res.json({ rows: filtered });
  } catch (err) {
    console.error("Error loading recipe edit/clone rows:", err);
    res.status(500).json({ error: "Failed to load recipe edit/clone rows", details: err.message });
  }
});

app.post("/api/bom/records", auth.authMiddleware, requireBomRecordWrite, async (req, res) => {
  try {
    await ensureBomRecordStoreReady();
    const { record, materials, calculationSnapshot, sourceRecordId, beamConfiguration } = req.body || {};
    if (!record || typeof record !== 'object') {
      return res.status(400).json({ error: 'Request body must include a record object.' });
    }
    if (!Array.isArray(materials)) {
      return res.status(400).json({ error: 'Request body must include a materials array.' });
    }

    let normalizedMaterials;
    try {
      normalizedMaterials = validateAndNormalizeBomMaterials(materials);
    } catch (validationErr) {
      return res.status(validationErr.statusCode || 400).json({ error: validationErr.message });
    }

    const duplicate = await findDuplicateSapLineRecord(record.sap_id, record.line);
    if (duplicate) {
      return res.status(409).json({ error: 'Duplicate recipe exists for this SAP ID and Line. Please use another SAP ID/Line combination.' });
    }

    // Allocate PD ID and record ID BEFORE opening the transaction to avoid
    // running SELECTs inside a BEGIN IMMEDIATE lock (node-sqlite3 serialized mode).
    const assignedPdId = await allocateNextBomPdId();

    let recordId = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = (Date.now() * 1000) + Math.floor(Math.random() * 1000);
      const existing = await db.get('SELECT id FROM bom_records WHERE id = ?', [candidate]);
      if (!existing) {
        recordId = candidate;
        break;
      }
    }
    if (!recordId) {
      throw new Error('Unable to allocate BOM record ID.');
    }

    await db.run('BEGIN');
    try {

      const snapshotToStore = normalizeCalculationSnapshot(calculationSnapshot);
      const normalizedBeamConfiguration = normalizeBeamConfigurationSnapshot(beamConfiguration);
      const hasBeamConfiguration = normalizedBeamConfiguration ? 1 : 0;

      const result = await db.run(`
        INSERT INTO bom_records (
          id,
          sap_id, pd_id, customer, market_segment, application, smms, mono_bico,
          structure, bico_ratio_desc, main_raw_mat, treatment, color, bonding,
          customer_bw, belt_bw, mb_grams, line, belt_speed, siko_percent, repro_percent,
          max_usable_width, usable_width, edge_trim_percent, web_loss_percent,
          other_scrap_percent, total_scrap_percent, gross_yield_percent,
          s_beams, m_beams, sb_throughput, mb_throughput, total_throughput, production_time,
          cores, slit_width, length_meters, roll_diameter,
          target_production, target_unit, overconsumption, notes, author, created_by, recipe_approved, calculation_snapshot_json,
          beam_configuration_json, has_beam_configuration, approval_decision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        recordId,
        record.sap_id || null, assignedPdId, record.customer || null,
        record.market_segment || null, record.application || null, record.smms || null,
        record.mono_bico || null, record.structure || null, record.bico_ratio_desc || null,
        record.main_raw_mat || null, record.treatment || null, record.color || null,
        record.bonding || null, record.customer_bw || null, record.belt_bw || null,
        record.mb_grams || null, record.line || null, record.belt_speed || null,
        record.siko_percent || null, record.repro_percent || null,
        record.max_usable_width || null, record.usable_width || null,
        record.edge_trim_percent || null, record.web_loss_percent || null,
        record.other_scrap_percent || null, record.total_scrap_percent || null,
        record.gross_yield_percent || null, record.s_beams || null, record.m_beams || null,
        record.sb_throughput || null, record.mb_throughput || null,
        record.total_throughput || null, record.production_time || null,
        record.cores || null, record.slit_width || null, record.length_meters || null,
        record.roll_diameter || null, record.target_production || null,
        record.target_unit || null,
        Number.isFinite(Number(record.overconsumption)) ? Number(record.overconsumption) : null,
        record.notes || null, req.user.name || 'Unknown', req.user.id,
        'No',
        snapshotToStore ? JSON.stringify(snapshotToStore) : null,
        normalizedBeamConfiguration ? JSON.stringify(normalizedBeamConfiguration) : null,
        hasBeamConfiguration,
        'Pending'
      ]);

      if (!result || result.changes !== 1) {
        throw new Error('Failed to insert BOM record header.');
      }

      for (let i = 0; i < normalizedMaterials.length; i++) {
        const m = normalizedMaterials[i] || {};
        const materialLabel = m.material_label || '';
        const materialName = m.material_name || '';
        const materialPercentage = Number.isFinite(Number(m.percentage)) ? Number(m.percentage) : 0;

        try {
          await db.run(
            'INSERT INTO bom_record_materials (record_id, sort_order, material_label, material_name, percentage) VALUES (?, ?, ?, ?, ?)',
            [recordId, i, materialLabel, materialName, materialPercentage]
          );
        } catch (insertErr) {
          throw new Error(`Material insert failed at index ${i} (recordId=${recordId}, label=${materialLabel || '<empty>'}, name=${materialName || '<empty>'}): ${insertErr.message}`);
        }
      }

      await db.run('COMMIT');
      const sourceId = parsePositiveInt(sourceRecordId);
      if (sourceId) {
        await auth.auditLog(req.user.id, 'BOM_RECORD_CLONED', 'bom_record', {
          sourceRecordId: sourceId,
          newRecordId: recordId,
          pdId: assignedPdId
        });
      } else {
        await auth.auditLog(req.user.id, 'BOM_RECORD_CREATED', 'bom_record', {
          recordId,
          pdId: assignedPdId
        });
      }

      let submissionEmailResult = { sent: false, reason: 'not_attempted' };
      try {
        submissionEmailResult = await sendRecipeSubmissionEmail({
          recipeRecord: { ...record, pd_id: assignedPdId, id: recordId },
          authorName: req.user.name || req.user.email || 'Unknown',
          isClone: !!sourceId
        });
      } catch (mailErr) {
        submissionEmailResult = { sent: false, reason: mailErr.message || 'mail_send_failed' };
      }
      if (!submissionEmailResult.sent) {
        console.warn('Recipe submission email was not sent:', submissionEmailResult.reason);
      }

      res.status(201).json({
        success: true,
        id: recordId,
        pd_id: assignedPdId,
        emailSent: !!submissionEmailResult.sent,
        emailReason: submissionEmailResult.reason || null
      });
    } catch (innerErr) {
      await db.run('ROLLBACK').catch(() => {});
      throw innerErr;
    }
  } catch (err) {
    console.error('Error saving BOM record:', err);
    res.status(500).json({ error: 'Failed to save BOM record', details: err.message });
  }
});

app.get("/api/bom/records", auth.authMiddleware, async (req, res) => {
  try {
    await ensureBomRecordStoreReady();
    const rows = await db.all(`
      SELECT id, pd_id, customer, line, customer_bw, author,
             created_at, updated_at, created_by,
             has_beam_configuration, beam_configuration_json
      FROM bom_records
      ORDER BY created_at DESC
    `);
    res.json({ records: rows });
  } catch (err) {
    console.error('Error listing BOM records:', err);
    res.status(500).json({ error: 'Failed to list BOM records', details: err.message });
  }
});

app.get("/api/bom/recipe-summary/metadata", auth.authMiddleware, async (req, res) => {
  try {
    await ensureBomRecordStoreReady();
    const selectedYear = parseOptionalYear(req.query.year);
    const lines = await getLinesForYear(selectedYear);
    const rows = await db.all(`
      SELECT sap_id, pd_id, customer, market_segment, application, smms, bonding,
             customer_bw, slit_width, treatment, author, line, overconsumption
      FROM bom_records
      ORDER BY created_at DESC
    `);

    const sapIds = [...new Set(rows.map((r) => r.sap_id).filter(Boolean))].sort();
    const pfnIds = [...new Set(rows.map((r) => r.pd_id).filter(Boolean))].sort();
    const customers = [...new Set(rows.map((r) => r.customer).filter(Boolean))].sort();
    const marketSegments = [...new Set(rows.map((r) => r.market_segment).filter(Boolean))].sort();
    const applications = [...new Set(rows.map((r) => r.application).filter(Boolean))].sort();
    const smsOptions = [...new Set(rows.map((r) => r.smms).filter(Boolean))].sort();
    const bondings = [...new Set(rows.map((r) => r.bonding).filter(Boolean))].sort();
    const basisWeights = [...new Set(rows.map((r) => r.customer_bw).filter((v) => v !== null && v !== undefined))]
      .sort((a, b) => Number(a) - Number(b));
    const slitWidths = [...new Set(rows.map((r) => r.slit_width).filter((v) => v !== null && v !== undefined))]
      .sort((a, b) => Number(a) - Number(b));
    const treatments = [...new Set(rows.map((r) => r.treatment).filter(Boolean))].sort();
    const authors = [...new Set(rows.map((r) => r.author).filter(Boolean))].sort();
    const overconsumptions = [...new Set(rows.map((r) => r.overconsumption).filter((v) => v !== null && v !== undefined))]
      .sort((a, b) => Number(a) - Number(b));
    const lineIds = [...new Set(rows.map((r) => r.line).filter(Boolean))].sort();
    const countries = [...new Set(
      rows
        .map((r) => (lines[(r.line || "").toString().trim()] || {}).country)
        .filter(Boolean)
    )].sort();

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
      currencies: ["USD", "CZK", "EUR", "ZAR", "GBP"],
      totalRecords: rows.length
    });
  } catch (err) {
    console.error("Error loading BOM recipe summary metadata:", err);
    res.status(500).json({ error: "Failed to load recipe summary metadata", details: err.message });
  }
});

app.get("/api/bom/recipe-summary", auth.authMiddleware, async (req, res) => {
  try {
    await ensureBomRecordStoreReady();
    const displayCurrency = req.query.currency || "USD";
    const selectedYear = parseOptionalYear(req.query.year);
    const lines = await getLinesForYear(selectedYear);

    const filters = {
      sapId: toMultiValueArray(req.query.sapId),
      pfnId: toMultiValueArray(req.query.pfnId),
      customer: toMultiValueArray(req.query.customer),
      marketSegment: toMultiValueArray(req.query.marketSegment),
      application: toMultiValueArray(req.query.application),
      s_sms: toMultiValueArray(req.query.s_sms),
      bonding: toMultiValueArray(req.query.bonding),
      basisWeight: toMultiValueArray(req.query.basisWeight),
      slitWidth: toMultiValueArray(req.query.slitWidth),
      treatment: toMultiValueArray(req.query.treatment),
      author: toMultiValueArray(req.query.author),
      lineId: toMultiValueArray(req.query.lineId),
      country: toMultiValueArray(req.query.country),
      overconsumption: toMultiValueArray(req.query.overconsumption)
    };

    const records = await db.all(`
      SELECT id, sap_id, pd_id, customer, market_segment, application, smms, bonding,
             customer_bw, slit_width, treatment, author, line,
             gross_yield_percent, total_throughput, overconsumption,
             recipe_approved, calculation_snapshot_json, created_at, updated_at
      FROM bom_records
      ORDER BY created_at DESC
    `);

    const materialRows = await db.all(`
      SELECT record_id, material_name, percentage, sort_order
      FROM bom_record_materials
      ORDER BY record_id, sort_order
    `);

    const materialsByRecord = new Map();
    for (const row of materialRows) {
      if (!materialsByRecord.has(row.record_id)) {
        materialsByRecord.set(row.record_id, []);
      }
      materialsByRecord.get(row.record_id).push(row);
    }

    const dbMaterialPrices = await buildDbMaterialPricesForLines(records.map((r) => r.line));

    const data = computeBomRecipeSummaryCosts({
      records,
      materialsByRecord,
      displayCurrency,
      filters,
      dbMaterialPrices,
      linesOverride: lines
    });

    res.json(data);
  } catch (err) {
    console.error("Error loading BOM recipe summary:", err);
    res.status(500).json({ error: "Failed to load recipe summary", details: err.message });
  }
});

app.get("/api/bom/recipe-summary/export", auth.authMiddleware, async (req, res) => {
  try {
    await ensureBomRecordStoreReady();
    const displayCurrency = req.query.currency || "USD";
    const format = String(req.query.format || "csv").toLowerCase();
    const selectedYear = parseOptionalYear(req.query.year);
    const lines = await getLinesForYear(selectedYear);

    const filters = {
      sapId: toMultiValueArray(req.query.sapId),
      pfnId: toMultiValueArray(req.query.pfnId),
      customer: toMultiValueArray(req.query.customer),
      marketSegment: toMultiValueArray(req.query.marketSegment),
      application: toMultiValueArray(req.query.application),
      s_sms: toMultiValueArray(req.query.s_sms),
      bonding: toMultiValueArray(req.query.bonding),
      basisWeight: toMultiValueArray(req.query.basisWeight),
      slitWidth: toMultiValueArray(req.query.slitWidth),
      treatment: toMultiValueArray(req.query.treatment),
      author: toMultiValueArray(req.query.author),
      lineId: toMultiValueArray(req.query.lineId),
      country: toMultiValueArray(req.query.country),
      overconsumption: toMultiValueArray(req.query.overconsumption)
    };

    const records = await db.all(`
      SELECT id, sap_id, pd_id, customer, market_segment, application, smms, bonding,
             customer_bw, slit_width, treatment, author, line,
             gross_yield_percent, total_throughput, overconsumption,
             recipe_approved, calculation_snapshot_json, created_at, updated_at
      FROM bom_records
      ORDER BY created_at DESC
    `);

    const materialRows = await db.all(`
      SELECT record_id, material_name, percentage, sort_order
      FROM bom_record_materials
      ORDER BY record_id, sort_order
    `);

    const materialsByRecord = new Map();
    for (const row of materialRows) {
      if (!materialsByRecord.has(row.record_id)) {
        materialsByRecord.set(row.record_id, []);
      }
      materialsByRecord.get(row.record_id).push(row);
    }

    const dbMaterialPrices = await buildDbMaterialPricesForLines(records.map((r) => r.line));

    const data = computeBomRecipeSummaryCosts({
      records,
      materialsByRecord,
      displayCurrency,
      filters,
      dbMaterialPrices,
      linesOverride: lines
    });

    if (!data.length) {
      return res.status(404).json({ error: "No data to export" });
    }

    const rows = data.map((item) => ({
      "Recipe Approved": item.recipeApproved || "",
      "SAP ID": item.sapId || "",
      "PD ID": item.pfnId || "",
      "Customer": item.customer || "",
      "Market Segment": item.marketSegment || "",
      "Application": item.application || "",
      "S/SMS": item.s_sms || "",
      "Bonding": item.bonding || "",
      "Basis Weight": item.basisWeight || "",
      "Slit Width": item.slitWidth || "",
      "Treatment": item.treatment || "",
      "Author": item.author || "",
      "Gross Yield %": Number.isFinite(Number(item.grossYield)) ? (Number(item.grossYield) * 100) : "",
      "Throughput": item.throughput || "",
      "Line": item.lineId || "",
      "Country": item.country || "",
      "Overconsumption %": Number.isFinite(Number(item.overconsumption)) ? (Number(item.overconsumption) * 100) : "",
      "Material Cost": Number.isFinite(Number(item.materialCostNet)) ? Number(item.materialCostNet) : "",
      "Process Cost": Number.isFinite(Number(item.processCost)) ? Number(item.processCost) : "",
      "Total Cost": Number.isFinite(Number(item.totalCost)) ? Number(item.totalCost) : "",
      "Currency": item.currency || displayCurrency
    }));

    const safeDate = new Date().toISOString().slice(0, 10);

    if (format === "xlsx" || format === "excel") {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Recipe Summary");
      const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="recipe-summary-${safeDate}.xlsx"`);
      return res.send(buffer);
    }

    const headers = Object.keys(rows[0]);
    const escapeCsvCell = (value) => {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    };
    const csv = [
      headers.map(escapeCsvCell).join(","),
      ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="recipe-summary-${safeDate}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error("Error exporting BOM recipe summary:", err);
    res.status(500).json({ error: "Failed to export recipe summary", details: err.message });
  }
});

app.get("/api/bom/records/:id", auth.authMiddleware, async (req, res) => {
  try {
    await ensureBomRecordStoreReady();
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid record ID.' });

    const record = await db.get('SELECT * FROM bom_records WHERE id = ?', [id]);
    if (!record) return res.status(404).json({ error: 'Record not found.' });

    const materials = await db.all(
      'SELECT material_label, material_name, percentage, sort_order FROM bom_record_materials WHERE record_id = ? ORDER BY sort_order',
      [id]
    );
    res.json({ record, materials });
  } catch (err) {
    console.error('Error loading BOM record:', err);
    res.status(500).json({ error: 'Failed to load BOM record', details: err.message });
  }
});

// ==================== RECIPE APPROVAL REGION MATRIX ====================

app.get("/api/admin/recipe-approval-region-matrix", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    await ensureBomRecordStoreReady();

    // Candidate users: members of groups named "Admin" or "Recipe Approvals"
    const candidateRows = await db.all(
      `SELECT DISTINCT u.id, u.email, u.name,
              GROUP_CONCAT(g.name) as group_names
       FROM users u
       JOIN user_groups ug ON u.id = ug.user_id
       JOIN groups g ON ug.group_id = g.id
       WHERE (g.name = 'Admin' OR g.name = 'Recipe Approvals')
         AND u.is_active = 1
       GROUP BY u.id
       ORDER BY u.name`
    );

    const assignments = await db.all('SELECT user_id, region FROM recipe_approval_region_assignments');
    const assignmentMap = {};
    assignments.forEach(row => {
      if (!assignmentMap[row.user_id]) assignmentMap[row.user_id] = {};
      assignmentMap[row.user_id][row.region] = true;
    });

    const matrix = candidateRows.map(user => {
      const regions = {};
      RECIPE_APPROVAL_REGIONS.forEach(r => { regions[r] = !!(assignmentMap[user.id] && assignmentMap[user.id][r]); });
      return {
        userId: String(user.id),
        name: user.name || '',
        email: user.email || '',
        groups: user.group_names ? user.group_names.split(',') : [],
        regions
      };
    });

    res.json({ regions: RECIPE_APPROVAL_REGIONS, matrix });
  } catch (err) {
    console.error('Error loading recipe approval region matrix:', err);
    res.status(500).json({ error: 'Failed to load region matrix', details: err.message });
  }
});

app.put("/api/admin/recipe-approval-region-matrix", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    await ensureBomRecordStoreReady();

    const { matrix } = req.body || {};
    if (!Array.isArray(matrix)) {
      return res.status(400).json({ error: 'Request body must include a matrix array.' });
    }

    // Resolve valid candidate user IDs (same query as GET)
    const candidateRows = await db.all(
      `SELECT DISTINCT u.id FROM users u
       JOIN user_groups ug ON u.id = ug.user_id
       JOIN groups g ON ug.group_id = g.id
       WHERE (g.name = 'Admin' OR g.name = 'Recipe Approvals') AND u.is_active = 1`
    );
    const validUserIds = new Set(candidateRows.map(r => String(r.id)));

    await db.run('BEGIN');
    try {
      for (const entry of matrix) {
        const userId = String(entry.userId || '');
        if (!userId || !validUserIds.has(userId)) continue;  // ignore non-candidates

        const regions = entry.regions || {};
        for (const region of RECIPE_APPROVAL_REGIONS) {
          if (regions[region]) {
            await db.run(
              'INSERT OR IGNORE INTO recipe_approval_region_assignments (user_id, region) VALUES (?, ?)',
              [Number(userId), region]
            );
          } else {
            await db.run(
              'DELETE FROM recipe_approval_region_assignments WHERE user_id = ? AND region = ?',
              [Number(userId), region]
            );
          }
        }
      }
      await db.run('COMMIT');
    } catch (innerErr) {
      await db.run('ROLLBACK').catch(() => {});
      throw innerErr;
    }

    // Return updated matrix (same shape as GET)
    const candidateFull = await db.all(
      `SELECT DISTINCT u.id, u.email, u.name,
              GROUP_CONCAT(g.name) as group_names
       FROM users u
       JOIN user_groups ug ON u.id = ug.user_id
       JOIN groups g ON ug.group_id = g.id
       WHERE (g.name = 'Admin' OR g.name = 'Recipe Approvals')
         AND u.is_active = 1
       GROUP BY u.id
       ORDER BY u.name`
    );
    const updatedAssignments = await db.all('SELECT user_id, region FROM recipe_approval_region_assignments');
    const updatedMap = {};
    updatedAssignments.forEach(row => {
      if (!updatedMap[row.user_id]) updatedMap[row.user_id] = {};
      updatedMap[row.user_id][row.region] = true;
    });
    const updatedMatrix = candidateFull.map(user => {
      const regions = {};
      RECIPE_APPROVAL_REGIONS.forEach(r => { regions[r] = !!(updatedMap[user.id] && updatedMap[user.id][r]); });
      return {
        userId: String(user.id),
        name: user.name || '',
        email: user.email || '',
        groups: user.group_names ? user.group_names.split(',') : [],
        regions
      };
    });

    res.json({ regions: RECIPE_APPROVAL_REGIONS, matrix: updatedMatrix });
  } catch (err) {
    console.error('Error saving recipe approval region matrix:', err);
    res.status(500).json({ error: 'Failed to save region matrix', details: err.message });
  }
});

app.get("/api/bom/approvals/pending", auth.authMiddleware, requireRecipeApprovalRead, async (req, res) => {
  try {
    await ensureBomRecordStoreReady();
    const rows = await db.all(`
      SELECT
        br.id,
        br.sap_id,
        br.pd_id,
        br.customer,
        br.line,
        br.author,
        br.created_by,
        br.created_at,
        br.updated_at,
        br.recipe_approved,
        br.approval_decision,
        br.approval_comment,
        br.approval_reviewed_at
      FROM bom_records br
      WHERE COALESCE(br.recipe_approved, 'Yes') = 'No'
      ORDER BY br.updated_at DESC, br.created_at DESC
    `);

    const enrichedRows = await Promise.all((rows || []).map(async (row) => {
      const rawDecision = String(row.approval_decision || '').trim();
      const normalizedDecision = rawDecision.toLowerCase() === 'approved' ? 'Pending' : (rawDecision || 'Pending');

      return {
        ...row,
        approval_decision: normalizedDecision,
        author_email: await resolveAuthorEmailByUserId(row.created_by)
      };
    }));

    res.json({ records: enrichedRows });
  } catch (err) {
    console.error("Error loading pending recipe approvals:", err);
    res.status(500).json({ error: "Failed to load pending approvals", details: err.message });
  }
});

app.get("/api/bom/approvals/:id", auth.authMiddleware, requireRecipeApprovalRead, async (req, res) => {
  try {
    await ensureBomRecordStoreReady();
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid record ID." });
    }

    const record = await db.get('SELECT * FROM bom_records WHERE id = ?', [id]);

    if (!record) {
      return res.status(404).json({ error: "Record not found." });
    }

    record.author_email = await resolveAuthorEmailByUserId(record.created_by);

    const materials = await db.all(
      "SELECT material_label, material_name, percentage, sort_order FROM bom_record_materials WHERE record_id = ? ORDER BY sort_order",
      [id]
    );

    res.json({ record, materials });
  } catch (err) {
    console.error("Error loading recipe approval detail:", err);
    res.status(500).json({ error: "Failed to load recipe detail", details: err.message });
  }
});

app.post("/api/bom/approvals/:id/action", auth.authMiddleware, requireRecipeApprovalModify, async (req, res) => {
  try {
    await ensureBomRecordStoreReady();
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid record ID." });
    }

    const normalizedAction = normalizeRecipeDecisionInput(req.body?.action);
    if (!normalizedAction) {
      return res.status(400).json({ error: "Action must be one of: approve, revise, reject." });
    }

    const comment = String(req.body?.comment || "").trim();
    if (!comment) {
      return res.status(400).json({ error: "Comment is required." });
    }

    const record = await db.get('SELECT * FROM bom_records WHERE id = ?', [id]);

    if (!record) {
      return res.status(404).json({ error: "Record not found." });
    }

    record.author_email = await resolveAuthorEmailByUserId(record.created_by);

    const mapped = mapRecipeDecisionToStatus(normalizedAction);

    await db.run(
      `UPDATE bom_records
       SET recipe_approved = ?,
           approval_decision = ?,
           approval_comment = ?,
           approval_reviewed_by = ?,
           approval_reviewed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [mapped.recipeApproved, mapped.approvalDecision, comment, req.user.id, id]
    );

    const pdIdForAudit = await resolveAuditPdId(id, record.pd_id || null);
    await auth.auditLog(req.user.id, "RECIPE_APPROVAL_ACTION", "bom_record", {
      recordId: id,
      pdId: pdIdForAudit,
      action: normalizedAction,
      decision: mapped.approvalDecision
    });

    let emailResult = { sent: false, reason: "not_attempted" };
    try {
      emailResult = await sendRecipeDecisionEmail({
        toEmail: record.author_email,
        reviewerName: req.user.name || req.user.email || "Unknown",
        decisionLabel: mapped.label,
        comment,
        recipeRecord: record
      });
    } catch (mailErr) {
      emailResult = { sent: false, reason: mailErr.message || "mail_send_failed" };
    }

    if (!emailResult.sent) {
      console.warn("Recipe approval email was not sent:", emailResult.reason);
    }

    res.json({
      success: true,
      message: `Recipe ${mapped.label.toLowerCase()}.`,
      result: {
        id,
        recipeApproved: mapped.recipeApproved,
        approvalDecision: mapped.approvalDecision,
        comment,
        emailSent: !!emailResult.sent,
        emailReason: emailResult.reason || null
      }
    });
  } catch (err) {
    console.error("Error applying recipe approval action:", err);
    res.status(500).json({ error: "Failed to process approval action", details: err.message });
  }
});

app.post("/api/bom/cost-preview", auth.authMiddleware, async (req, res) => {
  try {
    const { record, materials, currency, year } = req.body || {};
    if (!record || typeof record !== 'object') {
      return res.status(400).json({ error: 'Request body must include a record object.' });
    }
    if (!Array.isArray(materials)) {
      return res.status(400).json({ error: 'Request body must include a materials array.' });
    }

    const fx = loadFxRates() || {};
  const lines = await getLinesForYear(year || req.query.year);
    const loaded = loadMaterials(fx) || { materials: {}, siko: {} };
    const dbMaterialPrices = await buildDbMaterialPricesForLines([record.line]);
    const item = computeBomRecipeCostItem({
      record,
      recordMaterials: materials,
      displayCurrency: currency || 'USD',
      dbMaterialPrices,
      fx,
      lines,
      loaded
    });

    if (!item) {
      return res.status(400).json({ error: 'Unable to compute cost preview. Please verify line and required inputs.' });
    }

    res.json({ item });
  } catch (err) {
    console.error('Error computing BOM cost preview:', err);
    res.status(500).json({ error: 'Failed to compute BOM cost preview', details: err.message });
  }
});

app.put("/api/bom/records/:id", auth.authMiddleware, requireBomRecordWrite, async (req, res) => {
  try {
    await ensureBomRecordStoreReady();
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid record ID.' });

    const { record, materials, beamConfiguration } = req.body || {};
    if (!record || typeof record !== 'object') {
      return res.status(400).json({ error: 'Request body must include a record object.' });
    }
    if (!Array.isArray(materials)) {
      return res.status(400).json({ error: 'Request body must include a materials array.' });
    }

    const existing = await db.get('SELECT id, pd_id, has_beam_configuration, beam_configuration_json FROM bom_records WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Record not found.' });

    let normalizedMaterials;
    try {
      normalizedMaterials = validateAndNormalizeBomMaterials(materials);
      validatePdIdOrThrow(record.pd_id);
    } catch (validationErr) {
      return res.status(validationErr.statusCode || 400).json({ error: validationErr.message });
    }

    const hasBeamPayload = Object.prototype.hasOwnProperty.call(req.body || {}, 'beamConfiguration');
    const normalizedBeamConfiguration = hasBeamPayload
      ? normalizeBeamConfigurationSnapshot(beamConfiguration)
      : parseBeamConfiguration(existing.beam_configuration_json);
    const hasBeamConfiguration = normalizedBeamConfiguration ? 1 : 0;

    const existingPd = normalizeText(existing.pd_id);
    const nextPd = normalizeText(record.pd_id);
    if (existingPd && nextPd !== existingPd) {
      return res.status(400).json({ error: 'Existing PD ID cannot be changed in Edit mode.' });
    }

    const duplicate = await findDuplicateSapLineRecord(record.sap_id, record.line, id);
    if (duplicate) {
      return res.status(409).json({ error: 'Duplicate recipe exists for this SAP ID and Line. Please use another SAP ID/Line combination.' });
    }

    await db.run('BEGIN');
    try {
      await db.run(`
        UPDATE bom_records SET
          sap_id=?, pd_id=?, customer=?, market_segment=?, application=?, smms=?, mono_bico=?,
          structure=?, bico_ratio_desc=?, main_raw_mat=?, treatment=?, color=?, bonding=?,
          customer_bw=?, belt_bw=?, mb_grams=?, line=?, belt_speed=?, siko_percent=?, repro_percent=?,
          max_usable_width=?, usable_width=?, edge_trim_percent=?, web_loss_percent=?,
          other_scrap_percent=?, total_scrap_percent=?, gross_yield_percent=?,
          s_beams=?, m_beams=?, sb_throughput=?, mb_throughput=?, total_throughput=?, production_time=?,
          cores=?, slit_width=?, length_meters=?, roll_diameter=?,
          target_production=?, target_unit=?, overconsumption=?, notes=?,
          beam_configuration_json=?, has_beam_configuration=?,
          recipe_approved='Yes', approval_decision='Approved', approval_comment=NULL,
          approval_reviewed_by=NULL, approval_reviewed_at=NULL,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `, [
        record.sap_id || null, record.pd_id || null, record.customer || null,
        record.market_segment || null, record.application || null, record.smms || null,
        record.mono_bico || null, record.structure || null, record.bico_ratio_desc || null,
        record.main_raw_mat || null, record.treatment || null, record.color || null,
        record.bonding || null, record.customer_bw || null, record.belt_bw || null,
        record.mb_grams || null, record.line || null, record.belt_speed || null,
        record.siko_percent || null, record.repro_percent || null,
        record.max_usable_width || null, record.usable_width || null,
        record.edge_trim_percent || null, record.web_loss_percent || null,
        record.other_scrap_percent || null, record.total_scrap_percent || null,
        record.gross_yield_percent || null, record.s_beams || null, record.m_beams || null,
        record.sb_throughput || null, record.mb_throughput || null,
        record.total_throughput || null, record.production_time || null,
        record.cores || null, record.slit_width || null, record.length_meters || null,
        record.roll_diameter || null, record.target_production || null,
        record.target_unit || null,
        Number.isFinite(Number(record.overconsumption)) ? Number(record.overconsumption) : null,
        record.notes || null,
        normalizedBeamConfiguration ? JSON.stringify(normalizedBeamConfiguration) : null,
        hasBeamConfiguration,
        id
      ]);

      await db.run('DELETE FROM bom_record_materials WHERE record_id = ?', [id]);

      for (let i = 0; i < normalizedMaterials.length; i++) {
        const m = normalizedMaterials[i];
        await db.run(
          'INSERT INTO bom_record_materials (record_id, sort_order, material_label, material_name, percentage) VALUES (?,?,?,?,?)',
          [id, i, m.material_label || '', m.material_name || '', m.percentage || 0]
        );
      }

      await db.run('COMMIT');
      const pdIdForAudit = await resolveAuditPdId(id, record.pd_id || existing.pd_id || null);
      await auth.auditLog(req.user.id, 'BOM_RECORD_UPDATED', 'bom_record', {
        recordId: id,
        pdId: pdIdForAudit
      });
      res.json({ success: true, id });
    } catch (innerErr) {
      await db.run('ROLLBACK').catch(() => {});
      throw innerErr;
    }
  } catch (err) {
    console.error('Error updating BOM record:', err);
    res.status(500).json({ error: 'Failed to update BOM record', details: err.message });
  }
});

app.delete("/api/bom/records/:id", auth.authMiddleware, requireBomRecordDelete, async (req, res) => {
  try {
    await ensureBomRecordStoreReady();
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid record ID.' });

    const existing = await db.get('SELECT id, pd_id FROM bom_records WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Record not found.' });

    const pdIdForAudit = await resolveAuditPdId(id, existing.pd_id || null);

    await db.run('BEGIN');
    try {
      await db.run('DELETE FROM bom_record_materials WHERE record_id = ?', [id]);
      const result = await db.run('DELETE FROM bom_records WHERE id = ?', [id]);

      if (!result || result.changes !== 1) {
        throw new Error('Failed to delete BOM record.');
      }

      await db.run('COMMIT');
      await auth.auditLog(req.user.id, 'BOM_RECORD_DELETED', 'bom_record', {
        recordId: id,
        pdId: pdIdForAudit
      });
      res.json({ success: true, id });
    } catch (innerErr) {
      await db.run('ROLLBACK').catch(() => {});
      throw innerErr;
    }
  } catch (err) {
    console.error('Error deleting BOM record:', err);
    res.status(500).json({ error: 'Failed to delete BOM record', details: err.message });
  }
});

// DB download — admin only
app.get("/api/admin/db-download", auth.authMiddleware, async (req, res) => {
  if (!auth.hasPermission(req.user.role, "user:manage")) {
    return res.status(403).json({ error: "Admin only" });
  }

  const dbFilePath = db.dbPath;

  if (!fs.existsSync(dbFilePath)) {
    return res.status(404).json({ error: "DB file not found", path: dbFilePath });
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const fileName = `mini_erp-prod-${stamp}.db`;

  console.log(`[DB-DOWNLOAD] Admin ${req.user.email} downloaded DB snapshot: ${fileName}`);
  await auth.auditLog(req.user.id, 'DB_DOWNLOAD', 'database', { fileName });

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.sendFile(dbFilePath);
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

async function initializeStartupStores() {
  await auth.initializeDatabase();
  await polymerIndexes.initializeDatabase();
  await ensureCustomerStoreReady();
  await ensureBomListStoreReady();
  await ensureBomRecordStoreReady();
  await rmPrices.ensureReady();
  await fxRatesDb.initFxRatesTable();
  await lineRatesDb.initLineRatesTable();
}

async function startServer() {
  try {
    await initializeStartupStores();

    app.listen(PORT, () => {
      console.log(`✓ Server running at http://localhost:${PORT}`);
      console.log(`✓ Database initialized at ${db.dbPath}`);
      console.log(``);
      console.log(`Frontend routes:`);
      console.log(`  - GET / → /login.html (redirect)`);
      console.log(`  - GET /dashboard → index.html`);
      console.log(`  - GET /bom-calculator → bom-calculator.html`);
      console.log(`  - GET /bom-recipe-browser → bom-recipe-browser.html`);
      console.log(`  - GET /recipe-edit-clone → recipe-edit-clone.html`);
      console.log(`  - GET /rm-prices → rm-prices.html`);
      console.log(`  - GET /rm-prices/availability → rm-price-availability.html`);
      console.log(`  - GET /polymer-indexes → polymer-indexes.html`);
      console.log(`  - GET /fx-rates → fx-rates-management.html`);
      console.log(`  - GET /line-rates → line-rates-management.html`);
      console.log(``);
      console.log(`API endpoints:`);
      console.log(`  - GET /api/health - Health check`);
      console.log(`  - POST /api/auth/login - User login`);
      console.log(`Debug endpoints:`);
      console.log(`  - GET /api/debug/lines`);
      console.log(`  - GET /api/debug/materials`);
      console.log(`  - GET /api/debug/fx`);
    });
  } catch (err) {
    console.error('Failed to initialize startup stores:', err);
    process.exit(1);
  }
}

startServer();
