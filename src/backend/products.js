const XLSX = require("xlsx");
const path = require("path");

function loadProducts() {
  const filePath = path.join(__dirname, "..", "..", "data", "Products.xlsx");
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  if (rows.length === 0) return [];

  // Identify percentage columns from the HEADER ROW ONLY
  const headers = Object.keys(rows[0]);
  const percentageColumns = headers.filter(h => h.endsWith("%"));

  const products = [];

  rows.forEach(row => {
    const sapId = row["SAP ID"];
    const pfnId = row["PD ID"];
    const customer = row["Customer"];
    const marketSegment = row["Market segment"];
    const application = row["Application"];
    const s_sms = row["S/SMS"];
    const bonding = row["Bonding"];
    const basisWeight = row["Basis weight"];
    const slitWidth = row["Slit width"];
    const treatment = row["Treatment"];
    const author = row["Author"];
    const lineId = row.Line;
    const country = row.Country;

    const grossYield = row["Gross Yield"] || 1;
    const throughput = row.Throughput || 1;

    const overconsumption = row.Overconsumption || 0;

    const productionTime = (1000 / grossYield) / throughput;


    // Build materials from percentage columns
    let materials = [];

    percentageColumns.forEach(col => {
      const base = col.slice(0, -1); // remove %

      const materialName = row[base];
      const pct = row[col];

      // Skip if no percentage or no material name
      if (!pct || pct <= 0) return;
      if (!materialName || typeof materialName !== "string") return;

      materials.push({
        material: materialName,
        pct
      });
    });

    // SPECIAL RULE: SB1% must be replaced by Adj. SB1%
    const adjSB1 = row["Adj. SB1%"] || 0;
    const siko = row["Siko%"] || 0;
    const repro = row["Repro%"] || 0;

    const sb1Name = row["SB1"]; // SB1 material name

    // Remove SB1 entry if present
    materials = materials.filter(m => m.material !== sb1Name);

    // Add corrected SB1
    if (sb1Name && adjSB1 > 0) {
      materials.push({
        material: sb1Name,
        pct: adjSB1
      });
    }

    // Add Siko and Repro as real materials
    if (siko > 0) {
      materials.push({ material: "Siko", pct: siko });
    }
    if (repro > 0) {
      materials.push({ material: "Repro", pct: repro });
    }

    // Store final product object
    products.push({
      sapId,
      pfnId,
      customer,
      marketSegment,
      application,
      s_sms,
      bonding,
      basisWeight,
      slitWidth,
      treatment,
      author,
      lineId,
      country,
      grossYield,
      throughput,
      overconsumption,
      productionTime,
      materials
    });
  });

  return products;
}

module.exports = { loadProducts };