"use strict";

const { EmbeddingService, normalizeAndResize } = require("../embedding-service");

// Alias conservé pour les imports historiques.
module.exports = { EmbeddingClient: EmbeddingService, normalizeAndResize };
