const polymerIndexes = require("../src/backend/polymer-indexes");

// Historical data: [year, month, day, min, max]
const rawData = [
  [2026, 1, 2, null, null],     // 02/01/2026 - no data
  [2026, 1, 9, 1.25, 1.315],    // 09/01/2026
  [2026, 1, 16, 1.25, 1.315],   // 16/01/2026
  [2026, 1, 23, 1.25, 1.315],   // 23/01/2026
  [2026, 1, 30, 1.25, 1.315],   // 30/01/2026
  [2026, 2, 6, 1.25, 1.315],    // 06/02/2026
  [2026, 2, 13, 1.25, 1.315],   // 13/02/2026
  [2026, 2, 20, 1.265, 1.33],   // 20/02/2026
  [2026, 2, 27, 1.265, 1.33],   // 27/02/2026
];

async function importRaffiaData() {
  console.log("Initializing database...");
  await polymerIndexes.initializeDatabase();

  const rows = [];

  // Process each row of historical data
  for (const [yr, mo, da, min, max] of rawData) {
    // Skip rows with no data
    if (min === null || max === null) {
      console.log(`Skipping ${yr}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")} (no data)`);
      continue;
    }

    const dateStr = `${yr}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
    const middle = ((min + max) / 2).toFixed(5);

    // Create entries for Min, Max, and Middle
    rows.push({
      indexName: "ICIS Raffia Index - Min",
      valueDate: dateStr,
      value: min,
      source: "historical",
      notes: "2026 YTD data from ICIS",
    });

    rows.push({
      indexName: "ICIS Raffia Index - Max",
      valueDate: dateStr,
      value: max,
      source: "historical",
      notes: "2026 YTD data from ICIS",
    });

    rows.push({
      indexName: "ICIS Raffia Index - Middle",
      valueDate: dateStr,
      value: middle,
      source: "calculated",
      notes: "Middle = (Min + Max) / 2",
    });
  }

  console.log(`\nImporting ${rows.length} values across 3 index types...`);
  const result = await polymerIndexes.bulkImport(rows, null);

  console.log("\n✓ Import Complete:");
  console.log(`  Created: ${result.createdCount} values`);
  console.log(`  Updated: ${result.updatedCount} values`);
  console.log(`  Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log("\nErrors encountered:");
    result.errors.forEach((err) => console.log(`  - ${err}`));
  } else {
    console.log("\n✓ All data imported successfully!");
    console.log("  - Min values: 8 entries");
    console.log("  - Max values: 8 entries");
    console.log("  - Middle values: 8 entries (calculated)");
    console.log("\nRaffia Index is now ready for use in Polymer Indexes.");
  }

  process.exit(0);
}

importRaffiaData().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
