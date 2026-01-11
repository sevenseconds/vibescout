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
    this.buffer = [];
    this.maxBufferSize = 100;
  }

  setLevel(level) {
    this.level = level;
  }

  _log(levelName, message, ...args) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: levelName,
      message: message + (args.length ? ' ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ') : '')
    };
    
    this.buffer.push(logEntry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    console.error(`[${levelName}] ${message}`, ...args);
  }

  debug(message, ...args) {
    if (this.level <= LogLevel.DEBUG) {
      this._log('DEBUG', message, ...args);
    }
  }

  info(message, ...args) {
    if (this.level <= LogLevel.INFO) {
      this._log('INFO', message, ...args);
    }
  }

  warn(message, ...args) {
    if (this.level <= LogLevel.WARN) {
      this._log('WARN', message, ...args);
    }
  }

  error(message, ...args) {
    if (this.level <= LogLevel.ERROR) {
      this._log('ERROR', message, ...args);
    }
  }

  getRecentLogs() {
    return this.buffer;
  }
}

export const logger = new Logger();
