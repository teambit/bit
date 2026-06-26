import type * as express from 'express';
import { logger } from '@teambit/legacy.logger';

interface ResponseError {
  status?: number;
  message?: string;
}

export const catchErrors = (action: any) => (req: express.Request, res: express.Response, next: express.NextFunction) =>
  // TODO: @guy please take care of it
  // eslint-disable-next-line promise/no-callback-in-promise
  action(req, res, next).catch((error: ResponseError) => errorHandle(error, req, res, next));

export function errorHandle(
  err: ResponseError,
  req: express.Request,
  res: express.Response,
  // TODO: Do not remove unused next, it's needed for express to catch errors!
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: express.NextFunction
) {
  // the scope/lanes routes are an internal protocol (the caller is bit's own CLI), so a 4xx
  // validation failure typically signals a bug on our side - log it at error level like any other.
  logger.error(`express.errorHandle, url ${req.url}, error:`, err);
  err.status = err.status || 500;
  res.status(err.status);
  return res.jsonp({
    message: err.message,
    error: err,
  });
}
