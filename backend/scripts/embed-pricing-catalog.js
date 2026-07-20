"use strict";

const pool = require("../db");
const env = require("../env");
const { EmbeddingClient } = require("../services/pricing/embedding-client");
const { vectorLiteral } = require("../services/pricing/repository");

async function main() {
  const embeddings = new EmbeddingClient({
    apiKey: env.embeddingApiKey,
    enabled: env.embeddingEnabled,
    provider: env.embeddingProvider,
    baseUrl: env.embeddingBaseUrl,
    model: env.embeddingModel,
    dimensions: env.embeddingDimensions,
    requestDimensions: env.embeddingRequestDimensions,
    queryInstruction: env.embeddingQueryInstruction,
    timeoutMs: env.embeddingTimeoutMs,
  });
  const result = await pool.query("SELECT id, code, category, subcategory, name, notes FROM pricing_faults WHERE embedding IS NULL OR embedding_model <> $1 ORDER BY id", [embeddings.storageModel]);
  for (let offset = 0; offset < result.rows.length; offset += env.embeddingBatchSize) {
    const batch = result.rows.slice(offset, offset + env.embeddingBatchSize);
    const documents = batch.map((row) => [row.code, row.category, row.subcategory, row.name, row.notes].filter(Boolean).join(" | "));
    const vectors = await embeddings.embed(documents, "document");
    for (let index = 0; index < batch.length; index += 1) {
      await pool.query("UPDATE pricing_faults SET embedding=$1::vector, embedding_model=$2, updated_at=now() WHERE id=$3", [vectorLiteral(vectors[index]), embeddings.storageModel, batch[index].id]);
    }
    console.log(`Embedded ${Math.min(offset + batch.length, result.rows.length)}/${result.rows.length}`);
  }
  await pool.end();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
