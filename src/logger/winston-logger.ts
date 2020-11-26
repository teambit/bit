import path from 'path';
import winston from 'winston';
import { DEBUG_LOG, GLOBAL_LOGS } from '../constants';

// Store the extensionsLoggers to prevent create more than one logger for the same extension
// in case the extension developer use api.logger more than once
const extensionsLoggers = new Map();

export function getWinstonLogger(logLevel: string, jsonFormat: string) {
  const baseFileTransportOpts = {
    filename: DEBUG_LOG,
    format: jsonFormat ? winston.format.combine(winston.format.timestamp(), winston.format.json()) : getFormat(),
    level: logLevel,
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10,
    // If true, log files will be rolled based on maxsize and maxfiles, but in ascending order.
    // The filename will always have the most recent log lines. The larger the appended number, the older the log file
    tailable: true,
  };

  const winstonLogger = winston.createLogger({
    transports: [new winston.transports.File(baseFileTransportOpts)],
    exitOnError: false,
  });

  /**
   * Create a logger instance for extension
   * The extension name will be added as label so it will appear in the begining of each log line
   * The logger is cached for each extension so there is no problem to use getLogger few times for the same extension
   * @param {string} extensionName
   */
  const createExtensionLogger = (extensionName: string) => {
    // Getting logger from cache
    const existingLogger = extensionsLoggers.get(extensionName);

    if (existingLogger) {
      return existingLogger;
    }
    const extensionFileTransportOpts = Object.assign({}, baseFileTransportOpts, {
      filename: path.join(GLOBAL_LOGS, 'extensions.log'),
      label: extensionName,
    });
    const extLogger = winston.createLogger({
      transports: [new winston.transports.File(extensionFileTransportOpts)],
      exceptionHandlers: [new winston.transports.File(extensionFileTransportOpts)],
      exitOnError: false,
    });
    extensionsLoggers.set(extensionName, extLogger);
    return extLogger;
  };

  return { winstonLogger, createExtensionLogger };
}

function getMetadata(info) {
  if (!Object.keys(info.metadata).length) return '';
  if ((info.level === 'error' || info.level === '\u001b[31merror\u001b[39m') && info.metadata.stack) {
    // this is probably an instance of Error, show the stack nicely and not serialized.
    return `\n${info.metadata.stack}`;
  }
  try {
    return JSON.stringify(info.metadata, null, 2);
  } catch (err) {
    return `logger error: logging failed to stringify the metadata Json. (error: ${err.message})`;
  }
}

export function getFormat() {
  return winston.format.combine(
    winston.format.metadata(),
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.splat(), // does nothing?
    winston.format.errors({ stack: true }),
    winston.format.prettyPrint({ depth: 3, colorize: true }), // does nothing?
    winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message} ${getMetadata(info)}`)
  );
}
