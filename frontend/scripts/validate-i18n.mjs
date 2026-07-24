import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const fr = JSON.parse(fs.readFileSync(path.join(root, "src/i18n/locales/fr.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(root, "src/i18n/locales/en.json"), "utf8"));
const used = new Set();
for (const filename of fs.readdirSync(path.join(root, "src/app")).filter((name) => name.endsWith(".tsx"))) {
  const source = fs.readFileSync(path.join(root, "src/app", filename), "utf8");
  for (const match of source.matchAll(/(?:i18n\.t|\bt)\(\s*"([^"]+)"/g)) {
    used.add(match[1]);
  }
}
const hasKey = (catalog, key) => key in catalog
  || `${key}_one` in catalog
  || `${key}_other` in catalog;
const missingFr = [...used].filter((key) => !hasKey(fr, key));
const missingEn = [...used].filter((key) => !hasKey(en, key));
const onlyFr = Object.keys(fr).filter((key) => !(key in en));
const onlyEn = Object.keys(en).filter((key) => !(key in fr));
console.log(JSON.stringify({ used:used.size, fr:Object.keys(fr).length, en:Object.keys(en).length, missingFr, missingEn, onlyFr, onlyEn }, null, 2));
if (missingFr.length || missingEn.length || onlyFr.length || onlyEn.length) process.exitCode = 1;
