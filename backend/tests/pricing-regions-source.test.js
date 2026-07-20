"use strict";

const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");

test("le classeur de déploiement contient les régions et barèmes MENA", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.resolve(__dirname, "../../HVAC_Pricing_Base_MENA (1).xlsx"));
  const sheet = workbook.getWorksheet("Donnees_Regionales_MENA");
  assert.ok(sheet);
  const rows = [];
  for (let index = 2; index <= sheet.rowCount; index += 1) {
    const values = sheet.getRow(index).values.slice(1);
    if (values[0]) rows.push(values);
  }
  assert.ok(rows.length >= 20);
  assert.ok(rows.some((row) => row[0] === "Tunisie" && row[2] === "TND" && Number(row[3]) > 0));
  assert.ok(rows.some((row) => row[0] === "Algérie" && row[2] === "DZD" && Number(row[4]) > 0));
});
