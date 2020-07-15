import { Server } from 'http';

/**
 * interface for implementing dev servers.
 */
export interface DevServer {
  /**
   * attach to given port and start an http server
   */
  listen(port: number): Server;
}
