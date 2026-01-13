import fs from 'fs-extra';
import path from 'path';
import os from 'os';

/**
 * VibeScout Profiler - Chrome DevTools-compatible performance profiler
 *
 * Generates trace files compatible with chrome://tracing
 * Zero overhead when disabled via early returns
 * Supports configurable sampling rates to minimize overhead
 */
class Profiler {
  constructor() {
    this.enabled = false;
    this.samplingRate = 1.0;
    this.buffer = [];
    this.sessionStart = null;
    this.categorySampling = {};
    this.outputDir = path.join(os.homedir(), '.vibescout', 'profiles');
    this.maxBufferSize = 10000;
    this.random = Math.random;
  }

  /**
   * Configure profiler with options
   */
  configure(options = {}) {
    this.enabled = options.enabled || false;
    this.samplingRate = options.samplingRate ?? 1.0;
    this.outputDir = options.outputDir || this.outputDir;
    this.maxBufferSize = options.maxBufferSize || 10000;
    this.categorySampling = options.categorySampling || {};

    if (this.enabled && !this.sessionStart) {
      this.sessionStart = Date.now();
    }

    return this;
  }

  /**
   * Check if an operation should be sampled based on sampling rate
   * @param {string} category - Operation category (e.g., 'indexing', 'search')
   * @returns {boolean} True if should sample
   */
  shouldSample(category = null) {
    if (!this.enabled) return false;

    let rate = this.samplingRate;

    // Apply category-specific sampling multiplier if provided
    if (category && this.categorySampling[category] !== undefined) {
      rate = this.samplingRate * this.categorySampling[category];
    }

    if (rate >= 1.0) return true;
    if (rate <= 0.0) return false;

    return this.random() < rate;
  }

  /**
   * Get high-resolution timestamp in microseconds
   * Chrome DevTools expects timestamps in microseconds since epoch
   */
  getTimestamp() {
    const hrtime = process.hrtime();
    const microseconds = hrtime[0] * 1000000 + hrtime[1] / 1000;
    return Date.now() * 1000 + microseconds;
  }

  /**
   * Get thread ID (for async operations, use operation name as pseudo-thread)
   */
  getThreadId() {
    return 1; // Node.js is single-threaded, use 1 for main thread
  }

  /**
   * Record the start of an operation (Begin event)
   * @param {string} name - Operation name
   * @param {object} metadata - Additional metadata
   * @param {string} category - Operation category
   */
  start(name, metadata = {}, category = null) {
    if (!this.shouldSample(category)) return;

    const event = {
      ph: 'B', // Begin event
      name,
      cat: category || 'default',
      ts: this.getTimestamp(),
      pid: process.pid,
      tid: this.getThreadId(),
      args: metadata || {}
    };

    this.buffer.push(event);

    // Auto-flush if buffer exceeds max size
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  /**
   * Record the end of an operation (End event)
   * @param {string} name - Operation name
   * @param {object} metadata - Additional metadata
   * @param {string} category - Operation category
   */
  end(name, metadata = {}, category = null) {
    if (!this.shouldSample(category)) return;

    const event = {
      ph: 'E', // End event
      name,
      cat: category || 'default',
      ts: this.getTimestamp(),
      pid: process.pid,
      tid: this.getThreadId(),
      args: metadata || {}
    };

    this.buffer.push(event);

    // Auto-flush if buffer exceeds max size
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  /**
   * Record an instant event (no duration, marks a point in time)
   * @param {string} name - Event name
   * @param {object} metadata - Additional metadata
   * @param {string} category - Event category
   */
  mark(name, metadata = {}, category = null) {
    if (!this.shouldSample(category)) return;

    const event = {
      ph: 'I', // Instant event
      name,
      cat: category || 'default',
      ts: this.getTimestamp(),
      pid: process.pid,
      tid: this.getThreadId(),
      args: metadata || {}
    };

    this.buffer.push(event);

    // Auto-flush if buffer exceeds max size
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  /**
   * Record a counter metric
   * @param {string} name - Counter name
   * @param {number} value - Counter value
   * @param {object} metadata - Additional metadata
   * @param {string} category - Counter category
   */
  counter(name, value = 1, metadata = {}, category = null) {
    if (!this.shouldSample(category)) return;

    const event = {
      ph: 'C', // Counter event
      name,
      cat: category || 'default',
      ts: this.getTimestamp(),
      pid: process.pid,
      tid: this.getThreadId(),
      args: {
        ...metadata,
        value
      }
    };

    this.buffer.push(event);

    // Auto-flush if buffer exceeds max size
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  /**
   * Track an async operation (complete duration event)
   * @param {string} name - Operation name
   * @param {Function} fn - Async function to track
   * @param {object} metadata - Additional metadata
   * @param {string} category - Operation category
   * @returns {Promise} Result of the function
   */
  async trackAsync(name, fn, metadata = {}, category = null) {
    if (!this.shouldSample(category)) {
      return await fn();
    }

    const startTime = this.getTimestamp();

    try {
      const result = await fn();
      const endTime = this.getTimestamp();
      const duration = endTime - startTime;

      // Complete event with duration
      const event = {
        ph: 'X', // Complete event (duration)
        name,
        cat: category || 'default',
        ts: startTime,
        dur: duration,
        pid: process.pid,
        tid: this.getThreadId(),
        args: metadata || {}
      };

      this.buffer.push(event);

      // Auto-flush if buffer exceeds max size
      if (this.buffer.length >= this.maxBufferSize) {
        this.flush();
      }

      return result;
    } catch (error) {
      const endTime = this.getTimestamp();
      const duration = endTime - startTime;

      // Record failed operation
      const event = {
        ph: 'X',
        name: `${name} (error)`,
        cat: category || 'default',
        ts: startTime,
        dur: duration,
        pid: process.pid,
        tid: this.getThreadId(),
        args: {
          ...metadata,
          error: error.message
        }
      };

      this.buffer.push(event);

      throw error;
    }
  }

  /**
   * Clear all buffered events
   */
  clear() {
    this.buffer = [];
    this.sessionStart = null;
  }

  /**
   * Flush buffer to disk (keeping current session)
   */
  async flush() {
    if (this.buffer.length === 0) return;

    const timestamp = Date.now();
    const filename = `vibescout-profile-flush-${timestamp}.json`;
    const filepath = path.join(this.outputDir, filename);

    await fs.ensureDir(this.outputDir);

    const trace = {
      traceEvents: [...this.buffer],
      metadata: {
        version: "1.0",
        startTime: new Date(this.sessionStart || timestamp).toISOString(),
        endTime: new Date(timestamp).toISOString(),
        samplingRate: this.samplingRate,
        eventCount: this.buffer.length
      }
    };

    await fs.writeJson(filepath, trace, { spaces: 2 });

    // Clear buffer after successful write
    this.buffer = [];

    return filepath;
  }

  /**
   * Export trace to file and clear buffer
   * @returns {string} Path to exported trace file
   */
  async exportTrace() {
    if (this.buffer.length === 0) {
      return null;
    }

    const timestamp = Date.now();
    const filename = `vibescout-profile-${timestamp}.json`;
    const filepath = path.join(this.outputDir, filename);

    await fs.ensureDir(this.outputDir);

    const trace = {
      traceEvents: [...this.buffer],
      metadata: {
        version: "1.0",
        startTime: new Date(this.sessionStart || timestamp).toISOString(),
        endTime: new Date(timestamp).toISOString(),
        samplingRate: this.samplingRate,
        eventCount: this.buffer.length,
        pid: process.pid
      }
    };

    await fs.writeJson(filepath, trace, { spaces: 2 });

    // Clear buffer after export
    const eventCount = this.buffer.length;
    this.clear();

    return {
      filepath,
      eventCount,
      filename,
      startTime: trace.metadata.startTime,
      endTime: trace.metadata.endTime
    };
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      samplingRate: this.samplingRate,
      bufferedEvents: this.buffer.length,
      sessionStart: this.sessionStart ? new Date(this.sessionStart).toISOString() : null,
      outputDir: this.outputDir
    };
  }
}

// Singleton instance
export const profiler = new Profiler();

export default profiler;
