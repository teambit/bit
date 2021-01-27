import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';
import { DEBUG_LOG } from '../constants';

export function getPinoLogger(
  logLevel: string,
  jsonFormat: string
): { pinoLogger: PinoLogger; pinoLoggerConsole: PinoLogger } {
  const dest = pino.destination({
    dest: DEBUG_LOG, // omit for stdout
    sync: true, // no choice here :( otherwise, it looses data especially when an error is thrown (although pino.final is used to flush)
  });

  // https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#logseverity
  const PinoLevelToSeverityLookup = {
    trace: 'DEBUG',
    debug: 'DEBUG',
    info: 'INFO',
    warn: 'WARNING',
    error: 'ERROR',
    fatal: 'CRITICAL',
  };

  const formatters = {
    level(label: string, number: number) {
      return {
        severity: PinoLevelToSeverityLookup[label] || PinoLevelToSeverityLookup.info,
        level: number,
      };
    },
  };
  const prettyPrint = {
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'hostname',
  };

  const prettyPrintConsole = {
    colorize: true,
    ignore: 'hostname,pid,time,level',
  };

  /**
   * by default, Pino expects the first parameter to be an object and the second to be the message
   * string. since all current log messages were written using Winston, they're flipped - message
   * first and then other data.
   * this hook flips the first two arguments, so then it's fine to have the message as the first arg.
   */
  const hooks = {
    logMethod(inputArgs, method) {
      if (inputArgs.length >= 2 && inputArgs[1] !== undefined) {
        const arg1 = inputArgs.shift();
        const arg2 = inputArgs.shift();
        return method.apply(this, [arg2, arg1]);
      }
      return method.apply(this, inputArgs);
    },
  };

  const opts: LoggerOptions = {
    hooks,
    formatters,
  };

  if (!jsonFormat) {
    opts.prettyPrint = prettyPrint;
  }

  const pinoLogger: PinoLogger = pino(opts, dest);
  pinoLogger.level = logLevel;

  const pinoLoggerConsole = pino({ hooks, formatters, prettyPrint: jsonFormat ? false : prettyPrintConsole });
  pinoLoggerConsole.level = logLevel;

  return { pinoLogger, pinoLoggerConsole };
}
