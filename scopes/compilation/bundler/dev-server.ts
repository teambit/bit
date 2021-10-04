import { Server } from 'http';

/**
 * interface for implementing dev servers.
 */
export interface DevServer {
  /**
   * attach to given port and start an http server
   */
  listen(port: number): Server | Promise<Server>;

  /**
   * display name of the tester.
   */
  displayName?: string;

  /**
   * icon of the tester.
   */
  icon?: string;

  /**
   * serialized config of the tester.
   */
  displayConfig?(): string;

  /**
   * path to the config in the filesystem.
   */
  configPath?: string;

  /**
   * id of the tester.
   */
  id: string;

  /**
   * return the tester version.
   */
  version?(): string;
}
