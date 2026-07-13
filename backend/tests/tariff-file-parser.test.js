"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const { parseCsv, parseExcel, parsePdfText, parsePrice } = require("../services/tariff-file-parser");

test("lit les prix avec séparateurs français", () => {
  assert.equal(parsePrice("2 500,50 DZD"), 2500.5);
  assert.equal(parsePrice("45.00 €"), 45);
});

test("extrait un CSV avec colonnes françaises et champs cités", () => {
  const items = parseCsv(Buffer.from('Prestation;Unité;Tarif;Catégorie\n"Nettoyage, filtre";appareil;2 500,00;Maintenance'));
  assert.deepEqual(items, [{ service: "Nettoyage, filtre", unit: "appareil", price: 2500, category: "Maintenance" }]);
});

test("détecte la ligne d'en-tête dans un classeur Excel", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Tarifs");
  sheet.addRow(["GRILLE 2026"]); sheet.addRow([]);
  sheet.addRow(["Désignation", "Prix unitaire", "Unité"]);
  sheet.addRow(["Entretien climatiseur split", 3500, "appareil"]);
  const buffer = await workbook.xlsx.writeBuffer();
  const items = await parseExcel(Buffer.from(buffer));
  assert.deepEqual(items, [{ service: "Entretien climatiseur split", unit: "appareil", price: 3500, category: "Maintenance" }]);
});

test("extrait les lignes tarifaires d'un texte PDF", () => {
  const items = parsePdfText("GRILLE TARIFAIRE\nNettoyage climatiseur split 2 500 DZD\nRecharge gaz R32 : 6 000 DA\nTotal 8 500 DZD");
  assert.equal(items.length, 2);
  assert.equal(items[0].price, 2500);
  assert.equal(items[1].category, "Réparation");
});
