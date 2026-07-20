"use strict";

const path = require("path");
const ExcelJS = require("exceljs");
const pool = require("../db");

async function main() {
  const input = process.argv[2] || "../HVAC_Pricing_Base_MENA (1).xlsx";
  const workbookPath = path.resolve(process.cwd(), input);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const sheet = workbook.getWorksheet("Types_Pannes_Installations");
  const regionsSheet = workbook.getWorksheet("Donnees_Regionales_MENA");
  if (!sheet) throw new Error("Missing worksheet: Types_Pannes_Installations");
  if (!regionsSheet) throw new Error("Missing worksheet: Donnees_Regionales_MENA");

  const client = await pool.connect();
  let imported = 0;
  let importedRegions = 0;
  try {
    await client.query("BEGIN");
    for (let rowNumber = 2; rowNumber <= regionsSheet.rowCount; rowNumber += 1) {
      const row = regionsSheet.getRow(rowNumber);
      const [country, currencyName, currencyCode, exchangeRate, hourlyRate, labourAdjustment, importFactor, source] = row.values.slice(1);
      if (!country || !currencyCode || !exchangeRate) continue;
      await client.query(
        `INSERT INTO pricing_regions
          (country, currency_name, currency_code, exchange_rate_per_usd, local_hourly_rate,
           labour_adjustment, equipment_import_factor, source, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
         ON CONFLICT (country) DO UPDATE SET
           currency_name=EXCLUDED.currency_name,
           currency_code=EXCLUDED.currency_code,
           exchange_rate_per_usd=EXCLUDED.exchange_rate_per_usd,
           local_hourly_rate=EXCLUDED.local_hourly_rate,
           labour_adjustment=EXCLUDED.labour_adjustment,
           equipment_import_factor=EXCLUDED.equipment_import_factor,
           source=EXCLUDED.source,
           active=true,
           updated_at=now()`,
        [String(country).trim(), String(currencyName || currencyCode).trim(), String(currencyCode).trim(),
          Number(exchangeRate), Number(hourlyRate || 0), Number(labourAdjustment || 1),
          Number(importFactor || 1), source || null]
      );
      importedRegions += 1;
    }
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const [code, category, subcategory, name, interventionType, partsCost, hours, notes] = row.values.slice(1);
      if (!code || !name || !interventionType) continue;
      await client.query(
        `INSERT INTO pricing_faults
          (code, category, subcategory, name, intervention_type, base_parts_cost_usd, estimated_hours, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (code) DO UPDATE SET
           category=EXCLUDED.category,
           subcategory=EXCLUDED.subcategory,
           name=EXCLUDED.name,
           intervention_type=EXCLUDED.intervention_type,
           base_parts_cost_usd=EXCLUDED.base_parts_cost_usd,
           estimated_hours=EXCLUDED.estimated_hours,
           notes=EXCLUDED.notes,
           active=true,
           embedding=CASE WHEN
             (pricing_faults.category, pricing_faults.subcategory, pricing_faults.name, pricing_faults.notes)
             IS DISTINCT FROM
             (EXCLUDED.category, EXCLUDED.subcategory, EXCLUDED.name, EXCLUDED.notes)
             THEN NULL ELSE pricing_faults.embedding END,
           embedding_model=CASE WHEN
             (pricing_faults.category, pricing_faults.subcategory, pricing_faults.name, pricing_faults.notes)
             IS DISTINCT FROM
             (EXCLUDED.category, EXCLUDED.subcategory, EXCLUDED.name, EXCLUDED.notes)
             THEN NULL ELSE pricing_faults.embedding_model END,
           updated_at=now()`,
        [String(code).trim(), category || "", subcategory || null, String(name).trim(), String(interventionType).trim(), Number(partsCost || 0), Number(hours || 0), notes || null]
      );
      imported += 1;
    }
    await client.query("COMMIT");
    console.log(`Imported ${imported} pricing interventions and ${importedRegions} regions from ${path.basename(workbookPath)}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
