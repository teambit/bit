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
   * display name of the dev server.
   */
  displayName?: string;

  /**
   * icon of the dev server.
   */
  icon?: string;

  /**
   * serialized config of the dev server.
   */
  displayConfig?(): string;

  /**
   * path to the config in the filesystem.
   */
  configPath?: string;

  /**
   * id of the dev server.
   */
  id: string;

  /**
   * hash of the dev server.
   * This is used in order to determine if we should spin a different dev server.
   */
  hash?(): string;

  /**
   * return the dev server version.
   */
  version?(): string;
}
