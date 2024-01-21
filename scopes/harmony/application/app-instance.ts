export type ApplicationInstance = {
  /**
   * port in which app is running.
   */
  port?: number;

  /**
   * name of the app
   */
  appName?: string;

  /**
   * url of the running app.
   */
  url?: string;

  /**
   * function for closing the server.
   */
  stop?: () => Promise<void>;
};

/**
 * an instance of an application deployment.
 */
export type ApplicationDeployment = {
  /**
   * timestamp of the deployment.
   */
  timestamp?: string;

  /**
   * name of the deployed app.
   */
  appName?: string;

  /**
   * url the deployed app.
   */
  url?: string;
};
