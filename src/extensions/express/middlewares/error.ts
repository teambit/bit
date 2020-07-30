import * as express from 'express';

interface ResponseError {
  status?: number;
  message?: string;
}

export function notFound(req: express.Request, res: express.Response, next: express.NextFunction) {
  const err: ResponseError = new Error(`${req.method} ${req.url} Not Found`);
  err.status = 404;
  next(err);
}

export function errorHandle(err: ResponseError, req: express.Request, res: express.Response) {
  res.status(err.status || 500);
  return res.jsonp({
    message: err.message,
    error: err,
  });
}
