/**
 * Logger Utility
 * Logs to stderr to avoid interfering with JSON-RPC on stdout
 */

export enum LogLevel {
  ERROR = 'ERROR',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
}

export class Logger {
  private minLevel: LogLevel;

  constructor(minLevel: LogLevel = LogLevel.INFO) {
    this.minLevel = minLevel;
  }

  error(message: string, data?: unknown): void {
    this.log(LogLevel.ERROR, message, data);
  }

  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data);
  }

  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    // Check if message should be logged based on minLevel
    const levels = [LogLevel.ERROR, LogLevel.INFO, LogLevel.DEBUG];
    if (levels.indexOf(level) > levels.indexOf(this.minLevel)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logMessage = data
      ? `[${timestamp}] ${level}: ${message} ${JSON.stringify(data)}`
      : `[${timestamp}] ${level}: ${message}`;
    
    // Write to stderr to not interfere with JSON-RPC on stdout
    console.error(logMessage);
  }
}

export const logger = new Logger();
