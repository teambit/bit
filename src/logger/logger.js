/** @flow */
import winston from 'winston';
import path from 'path';
import { GLOBAL_LOGS } from '../constants';

const logger = new winston.Logger({
  transports: [
    new (winston.transports.File)({
      filename: path.join(GLOBAL_LOGS, 'debug.log'),
      json: false,
      level: process.env.NODE_ENV === 'production' ? 'error' : 'debug'
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join(GLOBAL_LOGS, 'exceptions.log'), json: false })
  ],
  exitOnError: false
});

// @credit Kegsay from https://github.com/winstonjs/winston/issues/228
// it solves an issue when exiting the code explicitly and the log file is not written
logger.exitAfterFlush = (code: number = 0) => {
  let level;
  let msg;
  if (code === 0) {
    level = 'info';
    msg = '[*] the command has been completed successfully';
  } else {
    level = 'error';
    msg = `[*] the command has been terminated with an error code ${code}`;
  }
  logger.log(level, msg, () => {
    let numFlushes = 0;
    let numFlushed = 0;
    Object.keys(logger.transports).forEach((k) => {
      if (logger.transports[k]._stream) {
        numFlushes += 1;
        logger.transports[k]._stream.once('finish', () => {
          numFlushed += 1;
          if (numFlushes === numFlushed) {
            process.exit(code);
          }
        });
        logger.transports[k]._stream.end();
      }
    });
    if (numFlushes === 0) {
      process.exit(code);
    }
  });
};

export default logger;
