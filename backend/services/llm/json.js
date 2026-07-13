"use strict";

function escapeControlCharactersInStrings(value) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (const character of value) {
    if (inString && !escaped && character === "\n") result += "\\n";
    else if (inString && !escaped && character === "\r") result += "\\r";
    else if (inString && !escaped && character === "\t") result += "\\t";
    else result += character;
    if (character === '"' && !escaped) inString = !inString;
    escaped = character === "\\" && !escaped;
    if (character !== "\\") escaped = false;
  }
  return result;
}

function parseJsonContent(content) {
  if (typeof content !== "string" || !content.trim()) throw new Error("LLM returned an empty response");
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  try { return JSON.parse(candidate); }
  catch { return JSON.parse(escapeControlCharactersInStrings(candidate)); }
}

module.exports = { parseJsonContent };
