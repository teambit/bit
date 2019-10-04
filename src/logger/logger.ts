import chalk from 'chalk';
import yn from 'yn';
import { serializeError } from 'serialize-error';
import format from 'string-format';
import winston from 'winston';
import * as path from 'path';
import { GLOBAL_LOGS, DEBUG_LOG, CFG_LOG_JSON_FORMAT, CFG_NO_WARNINGS } from '../constants';
import { Analytics } from '../analytics/analytics';
import { getSync } from '../api/consumer/lib/global-config';

// Store the extensionsLoggers to prevent create more than one logger for the same extension
// in case the extension developer use api.logger more than once
const extensionsLoggers = new Map();

const jsonFormat = yn(getSync(CFG_LOG_JSON_FORMAT), { default: false });

export const baseFileTransportOpts = {
  filename: DEBUG_LOG,
  format: jsonFormat ? winston.format.combine(winston.format.timestamp(), winston.format.json()) : getFormat(),
  level: 'debug',
  maxsize: 10 * 1024 * 1024, // 10MB
  maxFiles: 10,
  // If true, log files will be rolled based on maxsize and maxfiles, but in ascending order.
  // The filename will always have the most recent log lines. The larger the appended number, the older the log file
  tailable: true
};

export function getFormat() {
  return winston.format.combine(
    winston.format.metadata(),
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.splat(), // does nothing?
    winston.format.errors({ stack: true }),
    winston.format.prettyPrint({ depth: 3, colorize: true }), // does nothing?
    winston.format.printf(info => customPrint(info))
  );

  function customPrint(info) {
    const getMetadata = () => {
      if (!Object.keys(info.metadata).length) return '';
      try {
        return JSON.stringify(info.metadata, null, 2);
      } catch (err) {
        return `logger error: logging failed to stringify the metadata Json. (error: ${err.message})`;
      }
    };
    return `${info.timestamp} ${info.level}: ${info.message} ${getMetadata()}`;
  }
}

const exceptionsFileTransportOpts = Object.assign({}, baseFileTransportOpts, {
  filename: path.join(GLOBAL_LOGS, 'exceptions.log')
});

const logger = winston.createLogger({
  transports: [new winston.transports.File(baseFileTransportOpts)],
  exceptionHandlers: [new winston.transports.File(exceptionsFileTransportOpts)],
  exitOnError: false
});

/**
 * Create a logger instance for extension
 * The extension name will be added as label so it will appear in the begining of each log line
 * The logger is cached for each extension so there is no problem to use getLogger few times for the same extension
 * @param {string} extensionName
 */
export const createExtensionLogger = (extensionName: string) => {
  // Getting logger from cache
  const existingLogger = extensionsLoggers.get(extensionName);

  if (existingLogger) {
    return existingLogger;
  }
  const extensionFileTransportOpts = Object.assign({}, baseFileTransportOpts, {
    filename: path.join(GLOBAL_LOGS, 'extensions.log'),
    label: extensionName
  });
  const extLogger = winston.createLogger({
    transports: [new winston.transports.File(extensionFileTransportOpts)],
    exceptionHandlers: [new winston.transports.File(extensionFileTransportOpts)],
    exitOnError: false
  });
  extensionsLoggers.set(extensionName, extLogger);
  return extLogger;
};

export const printWarning = (msg: string) => {
  const cfgNoWarnings = getSync(CFG_NO_WARNINGS);
  if (cfgNoWarnings !== 'true') {
    // eslint-disable-next-line no-console
    console.log(chalk.yellow(`Warning: ${msg}`));
  }
};

logger.exitAfterFlush = async (code: number = 0, commandName: string) => {
  await Analytics.sendData();
  let level;
  let msg;
  if (code === 0) {
    level = 'info';
    msg = `[*] the command ${commandName} has been completed successfully`;
  } else {
    level = 'error';
    msg = `[*] the command ${commandName} has been terminated with an error code ${code}`;
  }
  logger[level](msg);
  await waitForLogger();
  process.exit(code);
};

/**
 * @credit dpraul from https://github.com/winstonjs/winston/issues/1250
 * it solves an issue when exiting the code explicitly and the log file is not written
 */
async function waitForLogger() {
  const loggerDone = new Promise(resolve => logger.on('finish', resolve));
  logger.end();
  return loggerDone;
}

function addBreakCrumb(category: string, message: string, data: Object = {}, extraData) {
  const hashedData = {};
  Object.keys(data).forEach(key => (hashedData[key] = Analytics.hashData(data[key])));
  const messageWithHashedData = format(message, hashedData);
  extraData = extraData instanceof Error ? serializeError(extraData) : extraData;
  Analytics.addBreadCrumb(category, messageWithHashedData, extraData);
}

logger.debugAndAddBreadCrumb = (category: string, message: string, data: Object, extraData?: Object) => {
  addToLoggerAndToBreadCrumb('debug', category, message, data);
};

logger.warnAndAddBreadCrumb = (category: string, message: string, data: Object, extraData?: Object) => {
  addToLoggerAndToBreadCrumb('warn', category, message, data, extraData);
};

logger.errorAndAddBreadCrumb = (category: string, message: string, data: Object, extraData?: Object) => {
  addToLoggerAndToBreadCrumb('error', category, message, data, extraData);
};

function addToLoggerAndToBreadCrumb(
  level: string,
  category: string,
  message: string,
  data: Object,
  extraData?: Object | null | undefined
) {
  if (!category) throw new TypeError('addToLoggerAndToBreadCrumb, category is missing');
  if (!message) throw new TypeError('addToLoggerAndToBreadCrumb, message is missing');
  const messageWithData = data ? format(message, data) : message;
  logger[level](`${category}, ${messageWithData}`, extraData);
  addBreakCrumb(category, message, data, extraData);
}

/**
 * prefix BIT_LOG to the command, provides the ability to log into the console.
 * two options are available here:
 * 1) use the level. e.g. `BIT_LOG=error bit import`.
 * 2) use the message prefix, e.g. `BIT_LOG=ssh bit import`.
 * 3) use multiple message prefixes, e.g. `BIT_LOG=ssh,env bit import`.
 */
if (process.env.BIT_LOG) {
  const levels = ['error', 'warn', 'info', 'verbose', 'debug', 'silly'];
  if (levels.includes(process.env.BIT_LOG)) {
    const level = process.env.BIT_LOG;
    logger.add(winston.transports.Console, { level });
    logger.cli();
  } else {
    const prefixes = process.env.BIT_LOG.split(',');
    logger.on('logging', (transport, level, msg) => {
      if (prefixes.some(prefix => msg.startsWith(prefix))) {
        console.log(`\n${msg}`);
      }
    });
  }
}

/**
 * useful when in the middle of the process, Bit needs to print to the console.
 * it's better than using `console.log` because, this way, it's possible to turn it on/off
 */
winston.loggers.add('consoleOnly', {
  format: winston.format.combine(winston.format.printf(info => info.message)),
  transports: [new winston.transports.Console({ level: 'silly' })]
});

logger.shouldWriteToConsole = true;
logger.console = {
  debug(...args) {
    this._logIfNeeded('debug', ...args);
  },
  info(...args) {
    this._logIfNeeded('info', ...args);
  },
  warn(...args) {
    this._logIfNeeded('warn', ...args);
  },
  error(...args) {
    this._logIfNeeded('error', ...args);
  },
  _logIfNeeded(level, ...args) {
    if (!logger.shouldWriteToConsole) {
      logger[level](...args);
      return;
    }
    winston.loggers.get('consoleOnly')[level](...args);
  }
};

export default logger;
