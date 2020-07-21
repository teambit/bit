import { Request } from './request';
import { Response } from './response';
import { NextFunction } from './next';

/**
 * express new Route
 */
export interface Route {
  method: string;
  route: string;
  middlewares: ((req: Request, res: Response, next?: NextFunction) => Promise<any>)[];
}
