import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default;
const root = path.resolve(import.meta.dirname, "..", "src", "app");
const allowedLiteralAttributes = new Set(["className","href","target","rel","type","accept","inputMode","autoComplete","role","color","size","dir","path","to","id","aria-modal"]);
const ignoredText = new Set(["QuoteAI","QuoteAI Pro","OK","Email","FR","EN","TND","DZD","MAD","EUR","USD","CSV","PDF","Excel","×","✕","★","—","·"]);
const findings = [];

function containsWords(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text && /[A-Za-zÀ-ÿ]{2}/.test(text) && !ignoredText.has(text);
}

function looksLikePresentationCode(value) {
  value = String(value || "").trim();
  return /(?:^\/|(?:^|\s)(?:flex|grid|text-|bg-|border-|rounded|hover:|sm:|md:|lg:|w-|h-|p-|m-|gap-|items-|justify-|font-|shadow|opacity|absolute|relative|fixed|transition|cursor|overflow|z-))/i.test(value)
    || /^(?:client|technician|user|bot|new|accepted|done|confirmed|cancelled|completed|pending|success|error|idle|processing|specific|daily|weekly|button|checkbox|time|date|long|numeric|rtl|ltr|green|red|blue|amber|gray|chat|rdv|map|messages|leads|tarifs|agenda|ask|loading|denied|register|login|all|name|email|phone|city|address|text|tel|fr|en|fr-FR|en-GB|2-digit|vector|embeddings|data:image\/)$/i.test(value)
    || /^\+?[0-9x .-]+$/i.test(value)
    || /^:? ?[0-9.,– -]+(?:TND|DZD|MAD|EUR|USD)$/i.test(value)
    || /^km$/i.test(value)
    || /scrollbar-width|::-webkit-scrollbar/.test(value)
    || /^(?:leads\.filters|schedule\.blockType)\.$/.test(value);
}

for (const filename of fs.readdirSync(root).filter((name) => name.endsWith(".tsx"))) {
  const source = fs.readFileSync(path.join(root, filename), "utf8");
  const ast = parse(source, { sourceType:"module", plugins:["typescript","jsx"] });
  traverse(ast, {
    JSXText(nodePath) {
      const value = nodePath.node.value.replace(/\s+/g, " ").trim();
      if (containsWords(value) && !looksLikePresentationCode(value)) findings.push({ filename, line:nodePath.node.loc?.start.line, kind:"text", value });
    },
    JSXAttribute(nodePath) {
      const name = nodePath.node.name.type === "JSXIdentifier" ? nodePath.node.name.name : "";
      if (allowedLiteralAttributes.has(name)) return;
      if (name === "aria-labelledby") return;
      if (nodePath.node.value?.type === "StringLiteral" && containsWords(nodePath.node.value.value)) {
        findings.push({ filename, line:nodePath.node.loc?.start.line, kind:`attribute:${name}`, value:nodePath.node.value.value });
      }
    },
    StringLiteral(nodePath) {
      if (!containsWords(nodePath.node.value)) return;
      if (nodePath.findParent((parent) => parent.isJSXAttribute())) return;
      if (!nodePath.findParent((parent) => parent.isJSXExpressionContainer())) return;
      if (nodePath.findParent((parent) => parent.isCallExpression()
        && (parent.get("callee").matchesPattern("i18n.t") || parent.get("callee").isIdentifier({name:"t"})))) return;
      if (looksLikePresentationCode(nodePath.node.value)) return;
      if (!/\s/.test(nodePath.node.value)) return;
      findings.push({ filename, line:nodePath.node.loc?.start.line, kind:"expression", value:nodePath.node.value });
    },
    TemplateElement(nodePath) {
      const value = nodePath.node.value.cooked || "";
      if (!containsWords(value) || !nodePath.findParent((parent) => parent.isJSXExpressionContainer())) return;
      if (nodePath.findParent((parent) => parent.isJSXAttribute()) || looksLikePresentationCode(value)) return;
      findings.push({ filename, line:nodePath.node.loc?.start.line, kind:"template", value:value.replace(/\s+/g, " ").trim() });
    },
  });
}

for (const finding of findings) {
  console.log(`${finding.filename}:${finding.line} [${finding.kind}] ${finding.value}`);
}
console.log(`Direct UI text findings: ${findings.length}`);
if (process.argv.includes("--check") && findings.length) process.exitCode = 1;
