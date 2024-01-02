import { NextFunction } from './next';
import { Request } from './request';
import { Response } from './response';

/**
 * define express Middleware
 */
export type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<any>;

export enum Verb {
  WRITE = 'write',
  READ = 'read',
}

/**
 * express new Route
 */

export interface Route {
  method: string;
  route: string | RegExp;
  disableNamespace?: boolean;
  verb?: Verb;
  middlewares: Middleware[];
  /** route priority if 2 route with the same name default is 0 */
  priority?: number;
}
