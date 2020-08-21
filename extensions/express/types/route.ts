import { Request } from './request';
import { Response } from './response';
import { NextFunction } from './next';

/**
 * define express Middleware
 */
export type Middleware = (req: Request, res: Response, next: NextFunction) => Promise<any>;

/**
 * express new Route
 */

export interface Route {
  method: string;
  route: string | RegExp;
  middlewares: Middleware[];
}
