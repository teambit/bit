/** @flow */
import winston from 'winston';
import path from 'path';

const logPath = path.join(__dirname, '..', '..');
const logger = new winston.Logger({
  transports: [
    new (winston.transports.File)({
      filename: path.join(logPath, 'debug.log'),
      json: false,
      level: process.env.NODE_ENV === 'development' ? 'debug' : 'error'
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join(logPath, 'exceptions.log'), json: false })
  ],
  exitOnError: false
});

// @credit da-mkay from https://github.com/winstonjs/winston/issues/228
// it solves an issue when exiting the code explicitly and the log file is not written
logger.exitAfterFlush = (code: number = 0) => {
  logger.transports.file.on('flush', () => {
    process.exit(code);
  });
};

export default logger;
