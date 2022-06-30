import { AppDeployContext, DeployFn } from '@teambit/application';

export interface DeployContext extends AppDeployContext {
  /**
   * the main file file of the app e.g: dist/app.js
   */
  mainFile?: string;
}

export type NodeAppOptions = {
  /**
   * name of the application.
   */
  name: string;

  /**
   * path to entry file of the application.
   * e.g: '/index.js'
   */
  entry: string;

  /**
   * ranges of ports to use to run the app server.
   */
  portRange?: number[];

  /**
   * deploy function.
   */
  deploy?: DeployFn;
};
