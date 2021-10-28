export type UIConfig = {
  /**
   * port for the UI root to use.
   */
  port?: number;

  /**
   * port range for the UI root to use.
   */
  portRange: [number, number];

  /**
   * host for the UI root
   */
  host: string;

  /**
   * directory in workspace to use for public assets.
   * always relative to the workspace root directory.
   */
  publicDir: string;

  /**
   * set `publicPath` value for webpack.config to override
   * in case server is not accessed using root route.
   */
  publicPath: string;

  /** the url to *display* when server is listening. Note that bit does not provide proxying to this url */
  publicUrl?: string;
};
