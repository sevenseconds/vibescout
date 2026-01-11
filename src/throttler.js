import { logger } from "./logger.js";

export class AdaptiveThrottler {
  constructor(name, initialConcurrency = 2, maxConcurrency = 8) {
    this.name = name;
    this.concurrency = initialConcurrency;
    this.maxConcurrency = maxConcurrency;
    this.activeCount = 0;
    this.successCount = 0;
    this.queue = [];
    this.minConcurrency = 1;
    this.errorPatterns = [];
    
    // How many successes before we try to increase concurrency
    this.increaseThreshold = 20; 
  }

  setErrorPatterns(patterns) {
    this.errorPatterns = patterns || [];
  }

  async run(task, retries = 3) {
    let lastError;
    for (let i = 0; i <= retries; i++) {
      // Wait until there's a slot
      if (this.activeCount >= this.concurrency) {
        await new Promise(resolve => this.queue.push(resolve));
      }

      this.activeCount++;
      try {
        const result = await task();
        this.handleSuccess();
        return result;
      } catch (err) {
        lastError = err;
        if (this.isConcurrencyError(err)) {
          this.handleFailure(err);
          // Exponential backoff before retry: 2s, 4s, 8s...
          const delay = Math.pow(2, i + 1) * 1000;
          logger.info(`[Throttler:${this.name}] Concurrency error detected. Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          // Non-concurrency error, don't retry here
          throw err;
        }
      } finally {
        this.activeCount--;
        this.processQueue();
      }
    }
    throw lastError;
  }

  processQueue() {
    if (this.queue.length > 0 && this.activeCount < this.concurrency) {
      const next = this.queue.shift();
      if (next) next();
    }
  }

  isConcurrencyError(err) {
    const msg = err.message || "";
    // If no patterns defined, use a safe default
    const patterns = this.errorPatterns.length > 0 
      ? this.errorPatterns 
      : ["429", "Rate limit", "too many requests"];

    return patterns.some(p => msg.includes(p));
  }

  handleSuccess() {
    this.successCount++;
    if (this.successCount >= this.increaseThreshold) {
      if (this.concurrency < this.maxConcurrency) {
        this.concurrency++;
        this.successCount = 0;
        logger.info(`[Throttler:${this.name}] Stabilized. Increasing concurrency to ${this.concurrency}`);
      }
    }
  }

  handleFailure(err) {
    this.successCount = 0;
    const oldLimit = this.concurrency;
    // Multiplicative Decrease: cut in half, or drop to 1 immediately if already low
    if (this.concurrency <= 2) {
      this.concurrency = 1;
    } else {
      this.concurrency = Math.max(this.minConcurrency, Math.floor(this.concurrency / 2));
    }
    
    if (oldLimit !== this.concurrency) {
      logger.warn(`[Throttler:${this.name}] Rate limit hit (Error ${err.message?.includes('1302') ? '1302' : 'Code'}). Reducing concurrency: ${oldLimit} -> ${this.concurrency}`);
    }
  }

  getLimit() {
    return this.concurrency;
  }
}

// Global throttler instances for major providers
// We use a map to keep them per-provider type
const throttlers = new Map();

export function getThrottler(providerName, errorPatterns = []) {
  if (!throttlers.has(providerName)) {
    throttlers.set(providerName, new AdaptiveThrottler(providerName));
  }
  const throttler = throttlers.get(providerName);
  if (errorPatterns.length > 0) {
    throttler.setErrorPatterns(errorPatterns);
  }
  return throttler;
}
