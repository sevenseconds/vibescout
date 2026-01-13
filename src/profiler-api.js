/**
 * VibeScout Profiler API - Zero-overhead profiling interface
 *
 * All functions return immediately if profiler is disabled (single boolean check)
 * Lazy loading of profiler module only when enabled
 * Minimal overhead when profiling is active
 */

let profilerEnabled = false;
let profilerInstance = null;

/**
 * Set profiler enabled state
 * @param {boolean} enabled - Whether profiling is enabled
 */
export function setProfilerEnabled(enabled) {
  profilerEnabled = !!enabled;
}

/**
 * Check if profiler is enabled
 * @returns {boolean} True if profiling is enabled
 */
export function isProfilerEnabled() {
  return profilerEnabled;
}

/**
 * Configure profiler with options
 * @param {object} options - Configuration options
 */
export async function configureProfiler(options) {
  if (options.enabled) {
    setProfilerEnabled(true);

    // Lazy load profiler only when configuring
    if (!profilerInstance) {
      const module = await import("./profiler.js");
      profilerInstance = module.profiler;
      profilerInstance.configure(options);
    } else {
      profilerInstance.configure(options);
    }
  }
}

/**
 * Get profiler instance (lazy loaded)
 * @returns {Profiler|null} Profiler instance or null if disabled
 */
async function getProfiler() {
  if (!profilerEnabled) return null;

  if (!profilerInstance) {
    // Lazy load on first use - use dynamic import for ES modules
    const module = await import("./profiler.js");
    profilerInstance = module.profiler;
  }

  return profilerInstance;
}

/**
 * Record the start of an operation
 * @param {string} name - Operation name
 * @param {object} metadata - Additional metadata
 * @param {string} category - Operation category (e.g., 'indexing', 'search')
 */
export async function profileStart(name, metadata = {}, category = null) {
  // FAST PATH: Single boolean check, returns immediately if disabled
  if (!profilerEnabled) return;

  // SLOW PATH: Only executed when enabled
  const profiler = await getProfiler();
  if (profiler) {
    profiler.start(name, metadata, category);
  }
}

/**
 * Record the end of an operation
 * @param {string} name - Operation name
 * @param {object} metadata - Additional metadata
 * @param {string} category - Operation category
 */
export async function profileEnd(name, metadata = {}, category = null) {
  // FAST PATH: Single boolean check
  if (!profilerEnabled) return;

  // SLOW PATH: Only executed when enabled
  const profiler = await getProfiler();
  if (profiler) {
    profiler.end(name, metadata, category);
  }
}

/**
 * Profile an async function automatically
 * @param {string} name - Operation name
 * @param {Function} fn - Async function to profile
 * @param {object} metadata - Additional metadata
 * @param {string} category - Operation category
 * @returns {Promise} Result of the function
 */
export async function profileAsync(name, fn, metadata = {}, category = null) {
  // FAST PATH: Single boolean check
  if (!profilerEnabled) {
    return await fn();
  }

  // SLOW PATH: Only executed when enabled
  const profiler = getProfiler();
  if (profiler) {
    return await profiler.trackAsync(name, fn, metadata, category);
  } else {
    return await fn();
  }
}

/**
 * Record an instant event (no duration)
 * @param {string} name - Event name
 * @param {object} metadata - Additional metadata
 * @param {string} category - Event category
 */
export async function profileMark(name, metadata = {}, category = null) {
  // FAST PATH: Single boolean check
  if (!profilerEnabled) return;

  // SLOW PATH: Only executed when enabled
  const profiler = await getProfiler();
  if (profiler) {
    profiler.mark(name, metadata, category);
  }
}

/**
 * Record a counter metric
 * @param {string} name - Counter name
 * @param {number} value - Counter value (default: 1)
 * @param {object} metadata - Additional metadata
 * @param {string} category - Counter category
 */
export async function profileCounter(name, value = 1, metadata = {}, category = null) {
  // FAST PATH: Single boolean check
  if (!profilerEnabled) return;

  // SLOW PATH: Only executed when enabled
  const profiler = await getProfiler();
  if (profiler) {
    profiler.counter(name, value, metadata, category);
  }
}

/**
 * Start profiling session
 * @param {number} samplingRate - Sampling rate (0.0-1.0)
 * @param {Array<string>} categories - Categories to profile
 */
export async function startProfiling(samplingRate = 1.0, categories = null) {
  setProfilerEnabled(true);

  const profiler = await getProfiler();
  if (profiler) {
    profiler.configure({
      enabled: true,
      samplingRate,
      categories
    });
  }
}

/**
 * Stop profiling and export trace
 * @returns {Promise<object|null>} Trace info or null if no data
 */
export async function stopProfiling() {
  const profiler = getProfiler();
  if (profiler) {
    const traceInfo = await profiler.exportTrace();
    setProfilerEnabled(false);
    return traceInfo;
  }
  return null;
}

/**
 * Get current profiler statistics
 * @returns {Promise<object>} Profiler stats
 */
export async function getProfilerStats() {
  const profiler = await getProfiler();
  if (profiler) {
    return profiler.getStats();
  }
  return {
    enabled: false,
    samplingRate: 0,
    bufferedEvents: 0
  };
}

/**
 * Clear profiler buffer
 */
export async function clearProfiler() {
  const profiler = await getProfiler();
  if (profiler) {
    profiler.clear();
  }
}
