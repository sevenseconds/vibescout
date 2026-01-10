export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

class Logger {
  constructor() {
    this.level = LogLevel.INFO;
  }

  setLevel(level) {
    this.level = level;
  }

  debug(message, ...args) {
    if (this.level <= LogLevel.DEBUG) {
      console.error(`[DEBUG] ${message}`, ...args);
    }
  }

  info(message, ...args) {
    if (this.level <= LogLevel.INFO) {
      console.error(`[INFO] ${message}`, ...args);
    }
  }

  warn(message, ...args) {
    if (this.level <= LogLevel.WARN) {
      console.error(`[WARN] ${message}`, ...args);
    }
  }

  error(message, ...args) {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }
}

export const logger = new Logger();
