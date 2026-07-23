"use strict";

const pool = require("../db");
const env = require("../env");
const { createEmbeddingService } = require("../services/embedding-service");
const { vectorLiteral } = require("../services/pricing/repository");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const embeddings = createEmbeddingService(env);
  const result = await pool.query("SELECT id, code, category, subcategory, name, notes FROM pricing_faults WHERE embedding IS NULL OR embedding_model <> $1 ORDER BY id", [embeddings.storageModel]);
  for (let offset = 0; offset < result.rows.length; offset += env.embeddingBatchSize) {
    const batch = result.rows.slice(offset, offset + env.embeddingBatchSize);
    const documents = batch.map((row) => [row.code, row.category, row.subcategory, row.name, row.notes].filter(Boolean).join(" | "));
    let vectors;
    for (;;) {
      try {
        vectors = await embeddings.embed(documents, "document");
        break;
      } catch (error) {
        if (!error?.retryable) throw error;
        const seconds = Math.ceil(env.embeddingQuotaRetryMs / 1000);
        console.warn(`Embedding quota/service unavailable (${error.code || "unknown"}); retrying batch at ${offset} in ${seconds}s`);
        await delay(env.embeddingQuotaRetryMs);
      }
    }
    for (let index = 0; index < batch.length; index += 1) {
      await pool.query("UPDATE pricing_faults SET embedding=$1::vector, embedding_model=$2, updated_at=now() WHERE id=$3", [vectorLiteral(vectors[index]), embeddings.storageModel, batch[index].id]);
    }
    console.log(`Embedded ${Math.min(offset + batch.length, result.rows.length)}/${result.rows.length}`);
  }
  await pool.end();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
