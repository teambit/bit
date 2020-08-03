import * as express from 'express';

interface ResponseError {
  status?: number;
  message?: string;
}

export const catchErrors = (action: any) => (req: express.Request, res: express.Response, next: express.NextFunction) =>
  // TODO: @guy please take care of it
  // eslint-disable-next-line promise/no-callback-in-promise
  action(req, res, next).catch(next);

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
  res.status(err.status || 500);
  return res.jsonp({
    message: err.message,
    error: err,
  });
}
