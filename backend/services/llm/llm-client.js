"use strict";

const { EXTRACTION_SYSTEM, WRITER_SYSTEM, JUDGE_SYSTEM } = require("../pricing/prompts");

class LlmClient {
  async generateJson() {
    throw new Error("generateJson() must be implemented by the LLM provider");
  }

  extract({ text, history = [], clientCountry, currentDate }) {
    return this.generateJson({
      operation: "extract",
      system: EXTRACTION_SYSTEM,
      payload: { text, history, client_country: clientCountry, current_date: currentDate },
      temperature: 0,
    });
  }

  redact({ extraction, calculation, confidence, uncertainty, previousRejection }) {
    return this.generateJson({
      operation: "redact",
      system: WRITER_SYSTEM,
      payload: { extraction, calculation, confidence, uncertainty, previous_rejection: previousRejection },
      temperature: 0.2,
    });
  }

  judge({ quote, extraction, calculation }) {
    return this.generateJson({
      operation: "judge",
      system: JUDGE_SYSTEM,
      payload: { quote, extraction, calculation },
      temperature: 0,
    });
  }
}

module.exports = { LlmClient };
