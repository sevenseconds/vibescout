import { logger } from "./logger.js";

export class AdaptiveThrottler {
  constructor(name, initialConcurrency = 4, maxConcurrency = 16) {
    this.name = name;
    this.concurrency = initialConcurrency;
    this.maxConcurrency = maxConcurrency;
    this.activeCount = 0;
    this.successCount = 0;
    this.queue = [];
    this.minConcurrency = 1;
    
    // How many successes before we try to increase concurrency
    this.increaseThreshold = 10; 
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
          // Backoff before retry
          const delay = Math.pow(2, i) * 1000;
          logger.debug(`[Throttler:${this.name}] Retrying in ${delay}ms...`);
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
    // Detect Z.AI / BigModel concurrency errors or standard 429s
    return (
      msg.includes("并发数过高") || 
      msg.includes("1214") || 
      msg.includes("429") || 
      msg.includes("Rate limit") ||
      msg.includes("too many requests")
    );
  }

  handleSuccess() {
    this.successCount++;
    if (this.successCount >= this.increaseThreshold) {
      if (this.concurrency < this.maxConcurrency) {
        this.concurrency++;
        this.successCount = 0;
        logger.debug(`[Throttler:${this.name}] Increasing concurrency to ${this.concurrency}`);
      }
    }
  }

  handleFailure(err) {
    this.successCount = 0;
    const oldLimit = this.concurrency;
    // Multiplicative Decrease (cut in half)
    this.concurrency = Math.max(this.minConcurrency, Math.floor(this.concurrency / 2));
    
    if (oldLimit !== this.concurrency) {
      logger.warn(`[Throttler:${this.name}] Rate limit hit. Reducing concurrency: ${oldLimit} -> ${this.concurrency}`);
    }
  }

  getLimit() {
    return this.concurrency;
  }
}

// Global throttler instances for major providers
// We use a map to keep them per-provider type
const throttlers = new Map();

export function getThrottler(providerName) {
  if (!throttlers.has(providerName)) {
    throttlers.set(providerName, new AdaptiveThrottler(providerName));
  }
  return throttlers.get(providerName);
}
