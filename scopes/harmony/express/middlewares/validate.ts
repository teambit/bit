import type { ZodError, ZodType } from 'zod';
import type { Middleware } from '../types';

/**
 * an error that carries an HTTP status code. the express error handler (see ./error.ts)
 * reads `status` and responds with it, instead of defaulting to 500.
 */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `"${path}" ${issue.message}` : issue.message;
    })
    .join('; ');
}

/**
 * validate `data` against a zod `schema`. returns the parsed (typed) data on success, and
 * throws an `HttpError` with status 400 and a readable message on failure.
 *
 * NOTE: these routes are part of the remote-scope protocol and talk to clients of varying
 * bit versions, so schemas should be permissive - validate the fields the route actually
 * uses, use `.passthrough()` for option objects, and avoid `.strict()`. otherwise a field
 * added/removed in another version would break cross-version compatibility.
 */
export function validateData<T>(schema: ZodType<T>, data: unknown, label = 'request body'): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(`invalid ${label}: ${formatZodError(result.error)}`, 400);
  }
  return result.data;
}

/**
 * express middleware that validates `req.body` against the given zod `schema`. on success the
 * parsed result is assigned back to `req.body`; on failure it responds with status 400.
 */
export function validateBody(schema: ZodType): Middleware {
  return async (req, _res, next) => {
    req.body = validateData(schema, req.body, 'request body');
    next();
  };
}
