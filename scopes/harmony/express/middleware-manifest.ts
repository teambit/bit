import type { Middleware } from './types';

export interface MiddlewareManifest {
  route?: string;
  middleware: Middleware;
}
