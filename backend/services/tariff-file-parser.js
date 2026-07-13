"use strict";

const ExcelJS = require("exceljs");
const { PDFParse } = require("pdf-parse");

const HEADER_ALIASES = {
  service: ["service", "prestation", "designation", "intitule", "intervention", "nom intervention", "description", "libelle"],
  unit: ["unite", "unite de mesure", "unite facturation", "unit"],
  price: ["prix", "tarif", "montant", "cout", "prix unitaire", "pu ht", "price", "cout base usd pieces"],
  category: ["categorie", "type", "famille", "category"],
};

function normalized(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[_\-]+/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function cellText(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
    if (value.result != null) return String(value.result);
    if (value.text != null) return String(value.text);
  }
  return String(value).trim();
}

function parsePrice(value) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  let text = String(value ?? "").replace(/\u00a0|\u202f/g, " ").replace(/[^0-9,.' -]/g, "").trim();
  if (!text) return null;
  text = text.replace(/\s+/g, "").replace(/'/g, "");
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma > lastDot) text = text.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma) text = text.replace(/,/g, "");
  else text = text.replace(",", ".");
  const price = Number(text);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function findHeader(values) {
  const columns = {};
  values.forEach((value, index) => {
    const header = normalized(cellText(value));
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (columns[field] == null && aliases.some((alias) => header === alias || header.startsWith(`${alias} `) || header.endsWith(` ${alias}`))) columns[field] = index;
    }
  });
  return columns.service != null && columns.price != null ? columns : null;
}

function inferCategory(service) {
  const text = normalized(service);
  if (/install|pose|montage/.test(text)) return "Installation";
  if (/nettoy|entretien|maintenance|revision|filtre/.test(text)) return "Maintenance";
  if (/urgent|week end|nuit|ferie/.test(text)) return "Urgence";
  if (/repar|remplac|depann|fuite|recharge/.test(text)) return "Réparation";
  return "Base";
}

function itemFromValues(values, columns) {
  const service = cellText(values[columns.service]).slice(0, 200).trim();
  const price = parsePrice(values[columns.price]);
  if (service.length < 2 || price == null) return null;
  const unit = columns.unit == null ? "" : cellText(values[columns.unit]).slice(0, 50);
  const categoryValue = columns.category == null ? "" : cellText(values[columns.category]);
  return { service, unit, price, category: categoryValue.slice(0, 50) || inferCategory(service) };
}

function deduplicate(items) {
  const unique = new Map();
  for (const item of items) unique.set(`${normalized(item.service)}|${normalized(item.unit)}`, item);
  return [...unique.values()].slice(0, 1000);
}

function parseCsvLine(line, delimiter) {
  const values = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === delimiter && !quoted) { values.push(value.trim()); value = ""; }
    else value += character;
  }
  values.push(value.trim());
  return values;
}

function parseCsv(buffer) {
  const lines = buffer.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = [";", ",", "\t"].sort((a, b) => (lines[0].split(b).length - lines[0].split(a).length))[0];
  const rows = lines.slice(0, 1002).map((line) => parseCsvLine(line, delimiter));
  const headerIndex = rows.findIndex(findHeader);
  if (headerIndex < 0) return [];
  const columns = findHeader(rows[headerIndex]);
  return deduplicate(rows.slice(headerIndex + 1).map((row) => itemFromValues(row, columns)).filter(Boolean));
}

async function parseExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const items = [];
  workbook.eachSheet((worksheet) => {
    let columns = null; let headerRow = null;
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > 2000) return;
      const values = row.values.slice(1).map(cellText);
      if (!columns && rowNumber <= 40) {
        const candidate = findHeader(values);
        if (candidate) { columns = candidate; headerRow = rowNumber; }
      } else if (columns && rowNumber > headerRow) {
        const item = itemFromValues(values, columns);
        if (item) items.push(item);
      }
    });
  });
  return deduplicate(items);
}

function parsePdfText(text) {
  const items = [];
  const ignored = /^(service|prestation|designation|intitule|prix|tarif|total|sous total|page)\b/i;
  for (const rawLine of String(text || "").split(/\r?\n/).slice(0, 5000)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (line.length < 4 || ignored.test(normalized(line))) continue;
    const match = line.match(/^(.*?)(?:\s*[|;:]\s*|\s{2,}|\s)(\d[\d\s.'’]*(?:[,.]\d{1,2})?)\s*(?:€|eur|da|dzd|dt|tnd|mad|dh)?\s*$/i);
    if (!match) continue;
    const service = match[1].replace(/[|;:.-]+$/, "").trim();
    const price = parsePrice(match[2]);
    if (service.length < 3 || price == null) continue;
    items.push({ service: service.slice(0, 200), unit: "", price, category: inferCategory(service) });
  }
  return deduplicate(items);
}

async function parsePdf(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return parsePdfText(result.text);
  } finally {
    await parser.destroy();
  }
}

async function parseTariffFile({ buffer, originalname = "", mimetype = "" }) {
  const extension = originalname.toLowerCase().split(".").pop();
  let items;
  if (extension === "csv" || mimetype.includes("csv")) items = parseCsv(buffer);
  else if (["xlsx", "xlsm"].includes(extension) || mimetype.includes("spreadsheetml")) items = await parseExcel(buffer);
  else if (extension === "pdf" || mimetype === "application/pdf") items = await parsePdf(buffer);
  else throw Object.assign(new Error("Format accepté : CSV, Excel .xlsx/.xlsm ou PDF texte."), { status: 400 });
  if (!items.length) {
    throw Object.assign(new Error(extension === "pdf"
      ? "Aucune ligne tarifaire détectée. Le PDF doit contenir du texte sélectionnable, pas uniquement une image scannée."
      : "Colonnes introuvables. Utilisez au minimum une colonne Service/Prestation et une colonne Prix/Tarif."), { status: 422 });
  }
  return items;
}

module.exports = { parseTariffFile, parseCsv, parseExcel, parsePdfText, parsePrice, findHeader };
