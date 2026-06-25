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
  err.status = err.status || 500;
  // 4xx are client errors (e.g. validation failures). log them as warnings with a minimal payload
  // so they don't add noise to the error logs or drown out genuine 5xx server failures.
  if (err.status >= 400 && err.status < 500) {
    logger.warn(`express.errorHandle, url ${req.url}, status ${err.status}, error: ${err.message}`);
  } else {
    logger.error(`express.errorHandle, url ${req.url}, error:`, err);
  }
  res.status(err.status);
  return res.jsonp({
    message: err.message,
    error: err,
  });
}
