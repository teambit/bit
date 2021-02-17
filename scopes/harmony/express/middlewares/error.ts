import * as express from 'express';
import logger from '@teambit/legacy/dist/logger/logger';

interface ResponseError {
  status?: number;
  message?: string;
}

export const catchErrors = (action: any) => (req: express.Request, res: express.Response, next: express.NextFunction) =>
  // TODO: @guy please take care of it
  // eslint-disable-next-line promise/no-callback-in-promise
  action(req, res, next).catch((error: ResponseError) => errorHandle(error, req, res, next));

export function notFound(req: express.Request, res: express.Response, next: express.NextFunction) {
  const err: ResponseError = new Error(`${req.method} ${req.url} Not Found`);
  err.status = 404;
  next(err);
}

export function errorHandle(
  err: ResponseError,
  req: express.Request,
  res: express.Response,
  // TODO: Do not remove unused next, it's needed for express to catch errors!
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: express.NextFunction
) {
  logger.error(`express.errorHandle, url ${req.url}, error:`, err);
  err.status = err.status || 500;
  res.status(err.status);
  return res.jsonp({
    message: err.message,
    error: err,
  });
}
