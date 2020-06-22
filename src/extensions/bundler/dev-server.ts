import { Server } from 'http';

/**
 * interface for implementing dev servers.
 */
export interface DevServer {
  listen(port: number): Server;
}
