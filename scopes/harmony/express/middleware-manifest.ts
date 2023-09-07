import { Middleware } from './types';

export interface MiddlewareManifest {
  route?: string;
  middleware: Middleware;
}
