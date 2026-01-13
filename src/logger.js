import { EventEmitter } from "events";
import fs from "fs-extra";
import path from "path";
import os from "os";

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

const LOG_DIR = path.join(os.homedir(), ".vibescout", "logs");
const MAIN_LOG_FILE = path.join(LOG_DIR, "vibescout.log");
const ACCESS_LOG_FILE = path.join(LOG_DIR, "access.log");

class Logger extends EventEmitter {
  constructor() {
    super();
    this.level = LogLevel.INFO;
    
    // Pick up level from environment if available
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLevel && LogLevel[envLevel] !== undefined) {
      this.level = LogLevel[envLevel];
    }
    
    this.buffer = [];
    this.maxBufferSize = 100;

    // Ensure log directory exists
    try {
      fs.ensureDirSync(LOG_DIR);
    } catch (err) {
      console.error("Failed to create log directory:", err.message);
    }
  }

  setLevel(level) {
    this.level = level;
  }

  _logToFile(filePath, message) {
    try {
      const timestamp = new Date().toISOString();
      fs.appendFileSync(filePath, `[${timestamp}] ${message}\n`);
    } catch (err) {
      // Fail silently to avoid infinite loops if logging fails
    }
  }

  /**
   * Log an API access event to the separate access log
   */
  access(message) {
    this._logToFile(ACCESS_LOG_FILE, message);
    if (this.level <= LogLevel.DEBUG) {
      console.error(`[ACCESS] ${message}`);
    }
  }

  _log(levelName, message, ...args) {
    const timestamp = new Date().toISOString();
    const formattedMessage = message + (args.length ? " " + args.map(a => typeof a === "object" ? JSON.stringify(a) : a).join(" ") : "");
    
    const logEntry = {
      timestamp,
      level: levelName,
      message: formattedMessage
    };
    
    this.buffer.push(logEntry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    this.emit("log", logEntry);

    // Console output
    console.error(`[${levelName}] ${message}`, ...args);

    // File output
    this._logToFile(MAIN_LOG_FILE, `[${levelName}] ${formattedMessage}`);
  }

  debug(message, ...args) {
    if (this.level <= LogLevel.DEBUG) {
      this._log("DEBUG", message, ...args);
    }
  }

  info(message, ...args) {
    if (this.level <= LogLevel.INFO) {
      this._log("INFO", message, ...args);
    }
  }

  warn(message, ...args) {
    if (this.level <= LogLevel.WARN) {
      this._log("WARN", message, ...args);
    }
  }

  error(message, ...args) {
    if (this.level <= LogLevel.ERROR) {
      this._log("ERROR", message, ...args);
    }
  }

  getRecentLogs() {
    return this.buffer;
  }
}

export const logger = new Logger();
