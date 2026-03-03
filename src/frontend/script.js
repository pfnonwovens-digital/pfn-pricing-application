// Global state
let currentData = [];
let currentCurrency = "USD";
let currentViewMode = "aggregated";
let metadata = null;
let currentSortColumn = null;
let currentSortDirection = 'asc'; // 'asc' or 'desc'

// Initialize on page load
window.onload = () => {
  loadMetadata();
  loadCosts();
  setupEventListeners();
  initCompactMode();
};

// Load metadata (available filters)
async function loadMetadata() {
  try {
    const res = await fetch("/api/metadata");
    if (!res.ok) throw new Error("Failed to load metadata");
    
    metadata = await res.json();
    populateDataLists(metadata);
  } catch (err) {
    console.warn("Could not load metadata:", err);
  }
}

// Populate datalist elements with metadata
function populateDataLists(meta) {
  if (!meta) return;

  // Populate selects (multiple) with options
  const setOptions = (id, items, formatter) => {
    const el = document.getElementById(id);
    if (!el) {
      console.warn("Element not found:", id);
      return;
    }
    const optionsHTML = items.map(i => {
      const label = formatter ? formatter(i) : i;
      return `<option value="${i}">${label}</option>`;
    }).join("");
    el.innerHTML = optionsHTML;
  };

  setOptions("filterSapId", meta.sapIds || []);
  setOptions("filterPfnId", meta.pfnIds || []);
  setOptions("filterCustomer", meta.customers || []);
  setOptions("filterMarketSegment", meta.marketSegments || []);
  setOptions("filterApplication", meta.applications || []);
  setOptions("filterSSMS", meta.smsOptions || []);
  setOptions("filterBonding", meta.bondings || []);
  setOptions("filterBasisWeight", meta.basisWeights || []);
  setOptions("filterSlitWidth", meta.slitWidths || []);
  setOptions("filterTreatment", meta.treatments || []);
  setOptions("filterAuthor", meta.authors || []);
  setOptions("filterOverconsumption", meta.overconsumptions || [], val => `${((val || 0) * 100).toFixed(2)}%`);
  
  setOptions("filterLine", meta.lineIds || []);
  setOptions("filterCountry", meta.countries || []);
  // Attach expand-on-focus behavior so selects act like dropdowns
  [
    "filterSapId","filterPfnId","filterCustomer","filterMarketSegment",
    "filterApplication","filterSSMS","filterBonding","filterBasisWeight",
    "filterSlitWidth","filterTreatment","filterAuthor","filterOverconsumption",
    "filterLine","filterCountry"
  ].forEach(id => attachExpandableMultiSelect(id));
}

// Helper to read multiple selected values from a <select multiple>
function getSelectValues(id) {
  const el = document.getElementById(id);
  if (!el) return [];
  return Array.from(el.selectedOptions).map(o => o.value).filter(v => v !== "");
}

// Make a <select multiple> behave like a dropdown that expands on click/focus
function attachExpandableMultiSelect(id, maxVisible = 12) {
  const el = document.getElementById(id);
  if (!el) return;
  // start collapsed
  try { el.size = 1; } catch (e) {}

  el.addEventListener("focus", () => {
    const optCount = Math.max(4, el.options.length);
    el.size = Math.min(maxVisible, optCount);
  });

  el.addEventListener("blur", () => {
    el.size = 1;
  });

  // On mousedown toggle open so users can Ctrl+click items
  el.addEventListener("mousedown", (e) => {
    if (el.size === 1) {
      e.preventDefault();
      const optCount = Math.max(4, el.options.length);
      el.size = Math.min(maxVisible, optCount);
      el.focus();
    }
  });
}

// Setup event listeners
function setupEventListeners() {
  const viewToggle = document.getElementById("viewToggle");
  viewToggle.addEventListener("change", (e) => {
    currentViewMode = e.target.value;
    renderView();
  });

  const currencySelect = document.getElementById("currencySelect");
  currencySelect.addEventListener("change", () => {
    loadCosts();
  });

  // Keep top scroller width in sync on resize
  window.addEventListener('resize', () => {
    setTimeout(updateTableScrollerWidth, 120);
  });
}

// Initialize and wire the top horizontal scroller to the table wrapper
function setupTableScroller() {
  const top = document.getElementById('tableScrollTop');
  const inner = document.getElementById('tableScrollInner');
  const wrapper = document.querySelector('#aggregatedView .table-wrapper');
  const table = document.getElementById('costTable');
  if (!top || !inner || !wrapper || !table) return;
  if (top.dataset.synced === '1') return;

  // Sync scroll positions both ways
  top.addEventListener('scroll', () => { wrapper.scrollLeft = top.scrollLeft; });
  wrapper.addEventListener('scroll', () => { top.scrollLeft = wrapper.scrollLeft; });

  top.dataset.synced = '1';
  updateTableScrollerWidth();
  // ensure visible
  top.style.display = '';
}

function updateTableScrollerWidth() {
  const table = document.getElementById('costTable');
  const inner = document.getElementById('tableScrollInner');
  const wrapper = document.querySelector('#aggregatedView .table-wrapper');
  if (!table || !inner || !wrapper) return;
  // Make inner at least 1px wider than the visible wrapper so the top scrollbar appears
  const targetWidth = Math.max(table.scrollWidth, wrapper.clientWidth + 1);
  inner.style.width = targetWidth + 'px';
}

// Load costs based on current filters
async function loadCosts() {
  console.log('[loadCosts] Function called');
  const currency = document.getElementById("currencySelect").value;
  const sapIds = getSelectValues("filterSapId");
  const pfnIds = getSelectValues("filterPfnId");
  const customers = getSelectValues("filterCustomer");
  const marketSegments = getSelectValues("filterMarketSegment");
  const applications = getSelectValues("filterApplication");
  const s_sms_vals = getSelectValues("filterSSMS");
  const bondings = getSelectValues("filterBonding");
  const basisWeights = getSelectValues("filterBasisWeight");
  const slitWidths = getSelectValues("filterSlitWidth");
  const treatments = getSelectValues("filterTreatment");
  const authors = getSelectValues("filterAuthor");
  const overconsumptions = getSelectValues("filterOverconsumption");
  const lineIds = getSelectValues("filterLine");
  const countries = getSelectValues("filterCountry");

  currentCurrency = currency;

  showLoading(true);
  hideError();

  try {
    const params = new URLSearchParams();
    params.append("currency", currency);
    sapIds.forEach(v => params.append("sapId", v));
    pfnIds.forEach(v => params.append("pfnId", v));
    customers.forEach(v => params.append("customer", v));
    marketSegments.forEach(v => params.append("marketSegment", v));
    applications.forEach(v => params.append("application", v));
    s_sms_vals.forEach(v => params.append("s_sms", v));
    bondings.forEach(v => params.append("bonding", v));
    basisWeights.forEach(v => params.append("basisWeight", v));
    slitWidths.forEach(v => params.append("slitWidth", v));
    treatments.forEach(v => params.append("treatment", v));
    authors.forEach(v => params.append("author", v));
    overconsumptions.forEach(v => params.append("overconsumption", v));
    lineIds.forEach(v => params.append("lineId", v));
    countries.forEach(v => params.append("country", v));

    console.log('[loadCosts] Fetching data from API...');
    const res = await fetch(`/api/costs?${params.toString()}`);
    
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    console.log('[loadCosts] Data received:', data.length, 'records');
    currentData = data;
    
    console.log('[loadCosts] Calling updateSummaryStats...');
    updateSummaryStats(data);
    console.log('[loadCosts] Calling renderView...');
    renderView();

  } catch (err) {
    console.error("Failed to load costs:", err);
    showError("Error loading costs. Check console for details.");
  } finally {
    showLoading(false);
  }
}

// Export costs to CSV
async function exportCosts() {
  const currency = document.getElementById("currencySelect").value;
  const sapIds = getSelectValues("filterSapId");
  const pfnIds = getSelectValues("filterPfnId");
  const customers = getSelectValues("filterCustomer");
  const marketSegments = getSelectValues("filterMarketSegment");
  const applications = getSelectValues("filterApplication");
  const s_sms_vals = getSelectValues("filterSSMS");
  const bondings = getSelectValues("filterBonding");
  const basisWeights = getSelectValues("filterBasisWeight");
  const slitWidths = getSelectValues("filterSlitWidth");
  const treatments = getSelectValues("filterTreatment");
  const authors = getSelectValues("filterAuthor");
  const overconsumptions = getSelectValues("filterOverconsumption");
  const lineIds = getSelectValues("filterLine");
  const countries = getSelectValues("filterCountry");

  try {
    const params = new URLSearchParams();
    params.append("currency", currency);
    sapIds.forEach(v => params.append("sapId", v));
    pfnIds.forEach(v => params.append("pfnId", v));
    customers.forEach(v => params.append("customer", v));
    marketSegments.forEach(v => params.append("marketSegment", v));
    applications.forEach(v => params.append("application", v));
    s_sms_vals.forEach(v => params.append("s_sms", v));
    bondings.forEach(v => params.append("bonding", v));
    basisWeights.forEach(v => params.append("basisWeight", v));
    slitWidths.forEach(v => params.append("slitWidth", v));
    treatments.forEach(v => params.append("treatment", v));
    authors.forEach(v => params.append("author", v));
    overconsumptions.forEach(v => params.append("overconsumption", v));
    lineIds.forEach(v => params.append("lineId", v));
    countries.forEach(v => params.append("country", v));

    const url = `/api/export/costs?${params.toString()}`;
    const a = document.createElement("a");
    a.href = url;
    a.click();
  } catch (err) {
    console.error("Failed to export costs:", err);
    showError("Error exporting costs. Check console for details.");
  }
}

// Clear all filters
function clearFilters() {
  const idsToClear = [
    "filterSapId", "filterPfnId", "filterCustomer", "filterMarketSegment",
    "filterApplication", "filterSSMS", "filterBonding", "filterBasisWeight",
    "filterSlitWidth", "filterTreatment", "filterAuthor", "filterOverconsumption", "filterLine",
    "filterCountry"
  ];

  idsToClear.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "SELECT") {
      // clear multiple or single select
      Array.from(el.options).forEach(o => o.selected = false);
    } else {
      el.value = "";
    }
  });

  const currencySel = document.getElementById("currencySelect");
  if (currencySel) currencySel.value = "USD";

  const viewToggle = document.getElementById("viewToggle");
  if (viewToggle) {
    viewToggle.value = "aggregated";
    currentViewMode = "aggregated";
  }

  // Close detail panel if open
  const detailPanel = document.getElementById("detailPanel");
  if (detailPanel) detailPanel.style.display = "none";

  loadCosts();
}

// Update summary statistics
function updateSummaryStats(data) {
  console.log('[updateSummaryStats] Called with data length:', data.length);
  const statsSection = document.getElementById("summaryStats");
  console.log('[updateSummaryStats] Stats section element:', statsSection);
  
  if (data.length === 0) {
    console.log('[updateSummaryStats] No data, hiding stats section');
    statsSection.style.display = "none";
    return;
  }

  console.log('[updateSummaryStats] Setting display to grid');
  statsSection.style.display = "grid";

  const avgMaterial = data.reduce((sum, item) => sum + (item.materialCostNet ?? item.materialCost ?? 0), 0) / data.length;
  const avgProcess = data.reduce((sum, item) => sum + item.processCost, 0) / data.length;
  const avgTotal = data.reduce((sum, item) => sum + item.totalCost, 0) / data.length;

  console.log('[updateSummaryStats] Calculated stats:', { avgMaterial, avgProcess, avgTotal });

  document.getElementById("statRecords").textContent = data.length;
  document.getElementById("statAvgMaterial").textContent = avgMaterial.toFixed(4) + " " + currentCurrency;
  document.getElementById("statAvgProcess").textContent = avgProcess.toFixed(4) + " " + currentCurrency;
  document.getElementById("statAvgTotal").textContent = avgTotal.toFixed(4) + " " + currentCurrency;
  
  console.log('[updateSummaryStats] Stats updated successfully');
}
// Update filter options based on current filtered data (cascading filters)
function updateFilterOptions() {
  if (currentData.length === 0) return;

  // Extract unique values from currentData for each filter field
  const uniqueValues = {
    sapId: [...new Set(currentData.map(d => d.sapId).filter(Boolean))].sort(),
    pfnId: [...new Set(currentData.map(d => d.pfnId).filter(Boolean))].sort(),
    customer: [...new Set(currentData.map(d => d.customer).filter(Boolean))].sort(),
    marketSegment: [...new Set(currentData.map(d => d.marketSegment).filter(Boolean))].sort(),
    application: [...new Set(currentData.map(d => d.application).filter(Boolean))].sort(),
    s_sms: [...new Set(currentData.map(d => d.s_sms).filter(Boolean))].sort(),
    bonding: [...new Set(currentData.map(d => d.bonding).filter(Boolean))].sort(),
    basisWeight: [...new Set(currentData.map(d => d.basisWeight).filter(Boolean))].sort((a, b) => parseFloat(a) - parseFloat(b)),
    slitWidth: [...new Set(currentData.map(d => d.slitWidth).filter(Boolean))].sort((a, b) => parseFloat(a) - parseFloat(b)),
    treatment: [...new Set(currentData.map(d => d.treatment).filter(Boolean))].sort(),
    author: [...new Set(currentData.map(d => d.author).filter(Boolean))].sort(),
    overconsumption: [...new Set(currentData.map(d => d.overconsumption))].sort((a, b) => a - b),
    lineId: [...new Set(currentData.map(d => d.lineId).filter(Boolean))].sort(),
    country: [...new Set(currentData.map(d => d.country).filter(Boolean))].sort()
  };

  // Map field names to select element IDs
  const fieldToSelectId = {
    sapId: 'filterSapId',
    pfnId: 'filterPfnId',
    customer: 'filterCustomer',
    marketSegment: 'filterMarketSegment',
    application: 'filterApplication',
    s_sms: 'filterSSMS',
    bonding: 'filterBonding',
    basisWeight: 'filterBasisWeight',
    slitWidth: 'filterSlitWidth',
    treatment: 'filterTreatment',
    author: 'filterAuthor',
    overconsumption: 'filterOverconsumption',
    lineId: 'filterLine',
    country: 'filterCountry'
  };

  // Update each select's options
  Object.entries(fieldToSelectId).forEach(([fieldName, selectId]) => {
    const select = document.getElementById(selectId);
    if (!select) return;

    // Store currently selected values
    const currentSelectedValues = Array.from(select.selectedOptions).map(o => o.value);
    const availableValues = uniqueValues[fieldName] || [];

    // Rebuild options with only available values
    select.innerHTML = availableValues.map(val => {
      let label = val;
      if (fieldName === 'overconsumption') {
        label = `${((val || 0) * 100).toFixed(2)}%`;
      }
      return `<option value="${val}">${label}</option>`;
    }).join('');

    // Re-select previously selected values that are still available
    currentSelectedValues.forEach(val => {
      const option = Array.from(select.options).find(o => o.value === val);
      if (option) {
        option.selected = true;
      }
    });
  });
}
// Render view based on current mode
function renderView() {
  const aggregatedView = document.getElementById("aggregatedView");
  const detailedView = document.getElementById("detailedView");

  // Update filter options based on current filtered data (cascading filters)
  updateFilterOptions();

  if (currentViewMode === "aggregated") {
    aggregatedView.style.display = "block";
    detailedView.style.display = "none";
    renderAggregatedView();
  } else {
    aggregatedView.style.display = "none";
    detailedView.style.display = "block";
    renderDetailedView();
  }
}

// Render aggregated (summary) view
function renderAggregatedView() {
  const tbody = document.querySelector("#costTable tbody");
  tbody.innerHTML = "";

  if (currentData.length === 0) {
    tbody.innerHTML = "<tr><td colspan='19' style='text-align: center; color: #999;'>No data found. Try adjusting your filters.</td></tr>";
    attachHeaderClickHandlers();
    return;
  }

  // Apply current sort if a column is selected
  if (currentSortColumn !== null) {
    sortTableData(currentSortColumn, currentSortDirection);
  }

  currentData.forEach(item => {
    const tr = document.createElement("tr");
    const matNet = item.materialCostNet ?? item.materialCost ?? 0;

    tr.innerHTML = `
      <td>${item.sapId || "-"}</td>
      <td>${item.pfnId || "-"}</td>
      <td>${item.customer || "-"}</td>
      <td>${item.marketSegment || "-"}</td>
      <td>${item.application || "-"}</td>
      <td>${item.s_sms || "-"}</td>
      <td>${item.bonding || "-"}</td>
      <td>${item.basisWeight || "-"}</td>
      <td>${item.slitWidth || "-"}</td>
      <td>${item.treatment || "-"}</td>
      <td>${item.author || "-"}</td>
      <td>${(item.grossYield * 100).toFixed(2)}</td>
      <td>${item.throughput ? Math.round(item.throughput) : "-"}</td>
      <td>${item.lineId}</td>
      <td>${item.country}</td>
      <td>${matNet.toFixed(4)}</td>
      <td>${item.processCost.toFixed(4)}</td>
      <td class="total">${item.totalCost.toFixed(4)}</td>
      <td>${item.currency}</td>
    `;

    tr.addEventListener("click", () => {
      showDetailPanel(item);
    });

    tbody.appendChild(tr);
  });
  // Attach header click handlers for sorting
  attachHeaderClickHandlers();
  // Ensure top scroller is synced to table width and listeners are attached
  try {
    setupTableScroller();
    setTimeout(updateTableScrollerWidth, 50);
  } catch (e) {}
}

// Render detailed view (expanded tables for each product)
function renderDetailedView() {
  const container = document.getElementById("detailedContent");
  container.innerHTML = "";

  if (currentData.length === 0) {
    container.innerHTML = "<p style='text-align: center; color: #999; padding: 40px;'>No data found. Try adjusting your filters.</p>";
    return;
  }

  currentData.forEach(item => {
    const section = createDetailedSection(item);
    container.appendChild(section);
  });
}

// Create a detailed section for one product
function createDetailedSection(item) {
  const section = document.createElement("div");
  section.className = "detailed-section";
  section.style.cssText = "background: #f9f9f9; padding: 20px; margin-bottom: 20px; border-radius: 8px; border-left: 4px solid #667eea;";

  const matNet = item.materialCostNet ?? item.materialCost ?? 0;
  const d = item.details || {};

  let html = `
    <h3 style="margin: 0 0 15px 0; color: #667eea; cursor: pointer;" onclick="this.parentElement.classList.toggle('collapsed')">${item.sapId || "-"} / ${item.pfnId || "-"} | Customer: ${item.customer || "-"} | Line ${item.lineId} | ${item.country}</h3>
    
    <div style="background: white; padding: 15px; border-radius: 6px; margin-bottom: 20px; border: 1px solid #e0e0e0;">
      <h4 style="margin: 0 0 12px 0; color: #333; font-size: 0.95em;">Product Specifications</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; font-size: 0.9em;">
        <div><strong>Market Segment:</strong> ${item.marketSegment || "-"}</div>
        <div><strong>Application:</strong> ${item.application || "-"}</div>
        <div><strong>S/SMS:</strong> ${item.s_sms || "-"}</div>
        <div><strong>Bonding:</strong> ${item.bonding || "-"}</div>
        <div><strong>Basis Weight:</strong> ${item.basisWeight || "-"}</div>
        <div><strong>Slit Width:</strong> ${item.slitWidth || "-"}</div>
        <div><strong>Treatment:</strong> ${item.treatment || "-"}</div>
        <div><strong>Author:</strong> ${item.author || "-"}</div>
        <div><strong>Gross Yield:</strong> ${(item.grossYield * 100).toFixed(2)}%</div>
        <div><strong>Throughput:</strong> ${item.throughput ? Math.round(item.throughput) : "-"}</div>
        <div><strong>Overconsumption:</strong> ${((item.overconsumption || 0) * 100).toFixed(2)}%</div>
      </div>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
      <div style="background: white; padding: 12px; border-radius: 6px;">
        <small style="color: #999;">Material Cost (Net)</small>
        <p style="margin: 5px 0 0 0; font-size: 1.3em; font-weight: bold; color: #667eea;">${matNet.toFixed(4)} ${item.currency}</p>
      </div>
      <div style="background: white; padding: 12px; border-radius: 6px;">
        <small style="color: #999;">Process Cost</small>
        <p style="margin: 5px 0 0 0; font-size: 1.3em; font-weight: bold; color: #764ba2;">${item.processCost.toFixed(4)} ${item.currency}</p>
      </div>
      <div style="background: white; padding: 12px; border-radius: 6px;">
        <small style="color: #999;">Total Cost</small>
        <p style="margin: 5px 0 0 0; font-size: 1.3em; font-weight: bold; color: #333;">${item.totalCost.toFixed(4)} ${item.currency}</p>
      </div>
    </div>
  `;

  // Material breakdown
  if (d.materials && d.materials.length > 0) {
    html += `
      <h4 style="margin-top: 20px; margin-bottom: 10px; color: #333; font-size: 1.1em;">Material Composition</h4>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
        <tr style="background: #e8eaf6; font-weight: bold;">
          <th style="padding: 10px; text-align: left; border: 1px solid #ccc;">Material</th>
          <th style="padding: 10px; text-align: right; border: 1px solid #ccc;">Base %</th>
          <th style="padding: 10px; text-align: right; border: 1px solid #ccc;">With OC %</th>
          <th style="padding: 10px; text-align: right; border: 1px solid #ccc;">Price (${item.currency}/kg)</th>
          <th style="padding: 10px; text-align: right; border: 1px solid #ccc;">Cost</th>
        </tr>
        ${d.materials.map(m => `
          <tr style="border: 1px solid #ccc;">
            <td style="padding: 10px; border: 1px solid #ccc;">${m.material}</td>
            <td style="padding: 10px; text-align: right; border: 1px solid #ccc;">${(m.basePct * 100).toFixed(2)}%</td>
            <td style="padding: 10px; text-align: right; border: 1px solid #ccc;">${(m.effectivePct * 100).toFixed(2)}%</td>
            <td style="padding: 10px; text-align: right; border: 1px solid #ccc;">${convertUsdToDisplay(m.priceUSD, item.fxRates).toFixed(4)}</td>
            <td style="padding: 10px; text-align: right; border: 1px solid #ccc; font-weight: bold;">${convertUsdToDisplay(m.finalCost, item.fxRates).toFixed(4)}</td>
          </tr>
        `).join("")}
      </table>
    `;
  }

  // Process cost breakdown
  if (d.process) {
    html += `
      <h4 style="margin-top: 20px; margin-bottom: 10px; color: #333; font-size: 1.1em;">Process Cost Components</h4>
      <p style="margin: 5px 0;"><strong>Throughput:</strong> ${(d.process.hoursPerTon || 0).toFixed(4)} hours/ton</p>
      
      <table style="width: 100%; border-collapse: collapse; font-size: 0.9em; margin-top: 10px;">
        <tr style="background: #e8eaf6; font-weight: bold;">
          <th style="padding: 10px; text-align: left; border: 1px solid #ccc;">Component</th>
          <th style="padding: 10px; text-align: right; border: 1px solid #ccc;">Hourly Line Cost (${item.currency})</th>
          <th style="padding: 10px; text-align: right; border: 1px solid #ccc;">Per kg (${item.currency})</th>
        </tr>
        ${Object.entries(d.process.hourlyComponents || {}).map(([k, v]) => {
          const perKg = d.process.hoursPerTon > 0 ? (v * d.process.hoursPerTon) / 1000 : 0;
          return `
            <tr style="border: 1px solid #ccc;">
              <td style="padding: 10px; border: 1px solid #ccc;">${formatComponentName(k)}</td>
              <td style="padding: 10px; text-align: right; border: 1px solid #ccc;">${convertUsdToDisplay(v, item.fxRates).toFixed(4)}</td>
              <td style="padding: 10px; text-align: right; border: 1px solid #ccc;">${convertUsdToDisplay(perKg, item.fxRates).toFixed(4)}</td>
            </tr>
          `;
        }).join("")}
      </table>

      <h4 style="margin-top: 20px; margin-bottom: 10px; color: #333; font-size: 1.1em;">Per-Ton Costs:</h4>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
        <tr style="background: #e8eaf6; font-weight: bold;">
          <th style="padding: 10px; text-align: left; border: 1px solid #ccc;">Component</th>
          <th style="padding: 10px; text-align: right; border: 1px solid #ccc;">Per Ton (${item.currency})</th>
          <th style="padding: 10px; text-align: right; border: 1px solid #ccc;">Per kg (${item.currency})</th>
        </tr>
        ${Object.entries(d.process.perTonComponents || {}).map(([k, v]) => {
          const perKg = v / 1000;
          return `
            <tr style="border: 1px solid #ccc;">
              <td style="padding: 10px; border: 1px solid #ccc;">${formatComponentName(k)}</td>
              <td style="padding: 10px; text-align: right; border: 1px solid #ccc;">${convertUsdToDisplay(v, item.fxRates).toFixed(4)}</td>
              <td style="padding: 10px; text-align: right; border: 1px solid #ccc;">${convertUsdToDisplay(perKg, item.fxRates).toFixed(4)}</td>
            </tr>
          `;
        }).join("")}
      </table>
    `;
  }

  section.innerHTML = html;
  return section;
}

// Show detail panel (modal)
function showDetailPanel(item) {
  const panel = document.getElementById("detailPanel");
  const content = document.getElementById("detailContent");

  const matNet = item.materialCostNet ?? item.materialCost ?? 0;
  const d = item.details || {};

  let html = `
    <h2 style="margin: 0 0 20px 0; color: #667eea;">Cost Details</h2>
    
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px;">
      <div>
        <strong>SAP ID:</strong> ${item.sapId || "-"}
      </div>
      <div>
        <strong>PFN ID:</strong> ${item.pfnId || "-"}
      </div>
      <div>
        <strong>Customer:</strong> ${item.customer || "-"}
      </div>
      <div>
        <strong>Market Segment:</strong> ${item.marketSegment || "-"}
      </div>
      <div>
        <strong>Application:</strong> ${item.application || "-"}
      </div>
      <div>
        <strong>S/SMS:</strong> ${item.s_sms || "-"}
      </div>
      <div>
        <strong>Bonding:</strong> ${item.bonding || "-"}
      </div>
      <div>
        <strong>Basis Weight:</strong> ${item.basisWeight || "-"}
      </div>
      <div>
        <strong>Slit Width:</strong> ${item.slitWidth || "-"}
      </div>
      <div>
        <strong>Treatment:</strong> ${item.treatment || "-"}
      </div>
      <div>
        <strong>Author:</strong> ${item.author || "-"}
      </div>
      <div>
        <strong>Gross Yield:</strong> ${(item.grossYield * 100).toFixed(2)}%
      </div>
      <div>
        <strong>Throughput:</strong> ${item.throughput ? Math.round(item.throughput) : "-"}
      </div>
      <div>
        <strong>Overconsumption:</strong> ${((item.overconsumption || 0) * 100).toFixed(2)}%
      </div>
      <div>
        <strong>Line:</strong> ${item.lineId}
      </div>
      <div>
        <strong>Country:</strong> ${item.country}
      </div>
      <div>
        <strong>Currency:</strong> ${item.currency}
      </div>
    </div>

    <h3 style="color: #667eea; margin-top: 0;">Cost Summary</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr style="background: #f0f0f0;">
        <td style="padding: 10px; border: 1px solid #ccc; font-weight: bold;">Material Cost (Net):</td>
        <td style="padding: 10px; border: 1px solid #ccc; text-align: right; font-weight: bold; color: #667eea;">${matNet.toFixed(4)} ${item.currency}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #ccc; font-weight: bold;">Process Cost:</td>
        <td style="padding: 10px; border: 1px solid #ccc; text-align: right; font-weight: bold; color: #764ba2;">${item.processCost.toFixed(4)} ${item.currency}</td>
      </tr>
      <tr style="background: #f0f0f0;">
        <td style="padding: 10px; border: 1px solid #ccc; font-weight: bold;">Total Cost:</td>
        <td style="padding: 10px; border: 1px solid #ccc; text-align: right; font-weight: bold; font-size: 1.2em; color: #333;">${item.totalCost.toFixed(4)} ${item.currency}</td>
      </tr>
    </table>

    <h3 style="color: #667eea;">Material Breakdown</h3>
  `;

  if (d.materials && d.materials.length > 0) {
    html += `
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead style="background: #e8eaf6;">
          <tr>
            <th style="padding: 10px; border: 1px solid #ccc; text-align: left;">Material</th>
            <th style="padding: 10px; border: 1px solid #ccc; text-align: center;">Base %</th>
            <th style="padding: 10px; border: 1px solid #ccc; text-align: center;">With OC %</th>
            <th style="padding: 10px; border: 1px solid #ccc; text-align: right;">Price</th>
            <th style="padding: 10px; border: 1px solid #ccc; text-align: right;">Cost</th>
          </tr>
        </thead>
        <tbody>
          ${d.materials.map(m => `
            <tr style="border: 1px solid #ccc;">
              <td style="padding: 10px; border: 1px solid #ccc;">${m.material}</td>
              <td style="padding: 10px; border: 1px solid #ccc; text-align: center;">${(m.basePct * 100).toFixed(2)}%</td>
              <td style="padding: 10px; border: 1px solid #ccc; text-align: center;">${(m.effectivePct * 100).toFixed(2)}%</td>
              <td style="padding: 10px; border: 1px solid #ccc; text-align: right;">${convertUsdToDisplay(m.priceUSD, item.fxRates).toFixed(4)} ${item.currency}</td>
              <td style="padding: 10px; border: 1px solid #ccc; text-align: right; font-weight: bold;">${convertUsdToDisplay(m.finalCost, item.fxRates).toFixed(4)} ${item.currency}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <p><strong>Base Material Cost (gross, includes overconsumption):</strong> ${convertUsdToDisplay(d.finalMaterialCostPerKgUSD, item.fxRates).toFixed(4)} ${item.currency}</p>
      <p><strong>Gross Yield:</strong> ${(d.grossYield * 100).toFixed(2)}% (Scrap: ${(d.scrapFraction * 100).toFixed(2)}%)</p>
      <p><strong>Net Material Cost (after scrap):</strong> ${convertUsdToDisplay(d.netMaterialCostPerKgUSD, item.fxRates).toFixed(4)} ${item.currency}</p>
    `;
  }

  if (d.process) {
    html += `
      <h3 style="color: #667eea;">Process Cost Components</h3>
      <p><strong>Hours per Ton:</strong> ${(d.process.hoursPerTon || 0).toFixed(4)}</p>

      <h4 style="margin-top: 15px;">Hourly Costs:</h4>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead style="background: #e8eaf6;">
          <tr style="font-weight: bold;">
            <th style="padding: 10px; border: 1px solid #ccc; text-align: left;">Component</th>
            <th style="padding: 10px; border: 1px solid #ccc; text-align: right;">Hourly Line Cost</th>
            <th style="padding: 10px; border: 1px solid #ccc; text-align: right;">Per kg</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(d.process.hourlyComponents || {}).map(([k, v]) => {
            const perKg = d.process.hoursPerTon > 0 ? (v * d.process.hoursPerTon) / 1000 : 0;
            return `
              <tr style="border: 1px solid #ccc;">
                <td style="padding: 10px; border: 1px solid #ccc;">${formatComponentName(k)}</td>
                <td style="padding: 10px; border: 1px solid #ccc; text-align: right;">${convertUsdToDisplay(v, item.fxRates).toFixed(4)} ${item.currency}</td>
                <td style="padding: 10px; border: 1px solid #ccc; text-align: right;">${convertUsdToDisplay(perKg, item.fxRates).toFixed(4)} ${item.currency}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>

      <h4 style="margin-top: 15px;">Per-Ton Costs:</h4>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead style="background: #e8eaf6;">
          <tr style="font-weight: bold;">
            <th style="padding: 10px; border: 1px solid #ccc; text-align: left;">Component</th>
            <th style="padding: 10px; border: 1px solid #ccc; text-align: right;">Per Ton</th>
            <th style="padding: 10px; border: 1px solid #ccc; text-align: right;">Per kg</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(d.process.perTonComponents || {}).map(([k, v]) => {
            const perKg = v / 1000;
            return `
              <tr style="border: 1px solid #ccc;">
                <td style="padding: 10px; border: 1px solid #ccc;">${formatComponentName(k)}</td>
                <td style="padding: 10px; border: 1px solid #ccc; text-align: right;">${convertUsdToDisplay(v, item.fxRates).toFixed(4)} ${item.currency}</td>
                <td style="padding: 10px; border: 1px solid #ccc; text-align: right;">${convertUsdToDisplay(perKg, item.fxRates).toFixed(4)} ${item.currency}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>

      <p><strong>Hourly Contribution:</strong> ${convertUsdToDisplay(d.process.hourlyCostContribution, item.fxRates).toFixed(4)} ${item.currency}/kg</p>
      <p><strong>Per-Ton Contribution:</strong> ${convertUsdToDisplay(d.process.perTonCostContribution, item.fxRates).toFixed(4)} ${item.currency}/kg</p>
    `;
  }

  content.innerHTML = html;
  panel.style.display = "flex";
}

// Close detail panel
function closeDetails() {
  document.getElementById("detailPanel").style.display = "none";
}

// Helper: Convert USD to display currency
function convertUsdToDisplay(usdValue, fx) {
  if (!fx || !usdValue) return usdValue || 0;
  const fxKey = `USD${currentCurrency}`;
  const rate = fx[fxKey] || 1;
  return (usdValue || 0) * rate;
}

// Helper: Format component names
function formatComponentName(key) {
  return key
    .replace(/USD/g, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim();
}

// Helper: Show loading spinner
function showLoading(show) {
  document.getElementById("loadingSpinner").style.display = show ? "block" : "none";
}

// Helper: Show/hide error
function showError(message) {
  const errorDiv = document.getElementById("errorMessage");
  if (message) {
    errorDiv.textContent = message;
    errorDiv.style.display = "block";
  } else {
    errorDiv.style.display = "none";
  }
}

function hideError() {
  document.getElementById("errorMessage").style.display = "none";
}

// Sorting functionality for aggregated view
function sortTableData(columnIndex, direction) {
  // Column index mapping
  const columnMap = {
    0: "sapId",
    1: "pfnId",
    2: "customer",
    3: "marketSegment",
    4: "application",
    5: "s_sms",
    6: "bonding",
    7: "basisWeight",
    8: "slitWidth",
    9: "treatment",
    10: "author",
    11: "grossYield",
    12: "throughput",
    13: "lineId",
    14: "country",
    15: "materialCostNet",
    16: "processCost",
    17: "totalCost",
    18: "currency"
  };

  const key = columnMap[columnIndex];
  if (!key) return;

  // Numeric columns
  const numericColumns = ["basisWeight", "slitWidth", "grossYield", "throughput", "materialCostNet", "processCost", "totalCost"];
  const isNumeric = numericColumns.includes(key);

  currentData.sort((a, b) => {
    let aVal = a[key];
    let bVal = b[key];

    if (aVal == null) aVal = isNumeric ? 0 : "";
    if (bVal == null) bVal = isNumeric ? 0 : "";

    if (isNumeric) {
      aVal = parseFloat(aVal) || 0;
      bVal = parseFloat(bVal) || 0;
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    } else {
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
      if (direction === 'asc') {
        return aVal.localeCompare(bVal);
      } else {
        return bVal.localeCompare(aVal);
      }
    }
  });
}

// Attach click handlers to table headers for sorting
function attachHeaderClickHandlers() {
  const thead = document.querySelector("#costTable thead tr");
  if (!thead) return;

  const headers = thead.querySelectorAll("th");
  headers.forEach((th, idx) => {
    // Remove old handler if any
    const newTh = th.cloneNode(true);
    th.parentNode.replaceChild(newTh, th);

    // Get original header text without any arrow
    let headerText = newTh.textContent.replace(/\s*[▲▼]\s*$/g, '').trim();

    // Update visual indicator
    if (idx === currentSortColumn) {
      newTh.style.cursor = "pointer";
      newTh.style.background = "linear-gradient(135deg, #3d5afe 0%, #1e40af 100%)";
      newTh.style.position = "relative";
      const arrow = currentSortDirection === 'asc' ? ' ▲' : ' ▼';
      newTh.innerHTML = headerText + arrow;
    } else {
      newTh.style.cursor = "pointer";
      newTh.style.background = "linear-gradient(135deg, #2b6cb0 0%, #1e40af 100%)";
      newTh.innerHTML = headerText;
    }

    // Add click handler
    newTh.addEventListener("click", () => {
      if (currentSortColumn === idx) {
        // Toggle direction if clicking same column
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        // New column, start with ascending
        currentSortColumn = idx;
        currentSortDirection = 'asc';
      }
      renderAggregatedView();
    });
  });
}

// Close detail panel when clicking outside
document.addEventListener("click", (e) => {
  const panel = document.getElementById("detailPanel");
  if (panel && panel.style.display === "flex" && e.target === panel) {
    closeDetails();
  }
});

// --- Compact mode support ---
function initCompactMode() {
  const btn = document.getElementById('compactToggle');
  const saved = localStorage.getItem('compactMode') === '1';
  setCompact(saved);
  if (btn) {
    btn.addEventListener('click', () => {
      const enabled = document.body.classList.contains('compact');
      setCompact(!enabled);
    });
  }
}

function setCompact(enable) {
  if (enable) {
    document.body.classList.add('compact');
    localStorage.setItem('compactMode', '1');
    const btn = document.getElementById('compactToggle'); if (btn) btn.textContent = 'Compact ✓';
  } else {
    document.body.classList.remove('compact');
    localStorage.removeItem('compactMode');
    const btn = document.getElementById('compactToggle'); if (btn) btn.textContent = 'Compact';
  }
  // Refresh table scroller sizes after style change
  setTimeout(() => { try { updateTableScrollerWidth(); } catch (e) {} }, 80);
}