"use strict";

class UpstreamServiceError extends Error {
  constructor(service, code, message, options = {}) {
    super(message, options);
    this.name = "UpstreamServiceError";
    this.service = service;
    this.code = code;
    this.status = 503;
    this.retryable = options.retryable !== false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(url, { headers = {}, body, timeoutMs = 30000, retries = 2, service = "upstream" }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        const error = new UpstreamServiceError(service, `${service}_http_${response.status}`, `${service} temporarily unavailable`, { retryable });
        if (!retryable || attempt === retries) throw error;
        lastError = error;
      } else {
        return payload;
      }
    } catch (error) {
      const normalized = error instanceof UpstreamServiceError
        ? error
        : new UpstreamServiceError(service, error?.name === "AbortError" ? `${service}_timeout` : `${service}_network_error`, `${service} temporarily unavailable`, { cause: error });
      if (!normalized.retryable || attempt === retries) throw normalized;
      lastError = normalized;
    } finally {
      clearTimeout(timeout);
    }
    await delay(250 * (2 ** attempt));
  }
  throw lastError;
}

module.exports = { postJson, UpstreamServiceError };
