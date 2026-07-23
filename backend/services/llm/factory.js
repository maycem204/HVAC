"use strict";

const { createAiService } = require("../ai-service");

// Nom historique conservé : les appelants reçoivent désormais le service abstrait.
const createLlmClient = createAiService;

module.exports = { createLlmClient, createAiService };
