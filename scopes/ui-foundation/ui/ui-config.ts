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
   * set the url basename of the main UI.
   * This is used as `publicPath` in webpack config and basename in react-router.
   * @example '/~settings' --> '/base-url/~settings' // when urlBasename is "base-url"
   */
  urlBasename?: string;

  /** the url to *display* when server is listening. Note that bit does not provide proxying to this url */
  publicUrl?: string;
};
