import { Bundler, DevServer } from '@teambit/bundler';
import { DeployContext } from '@teambit/application';

export type ReactAppOptions = {
  /**
   * name of the application.
   */
  name: string;

  /**
   * path to entry files of the application.
   */
  buildEntry: string[];

  /**
   * absolute path to entry files of the application.
   */
  runEntry: string[];

  /**
   * use server-side rendering for the app.
   */
  ssr?: boolean;

  /**
   * instance of bundler to use.
   */
  bundler?: Bundler;

  /**
   * instance of dev server to use.
   */
  devServer?: DevServer;

  /**
   * deploy function.
   */
  deploy?: (context: DeployContext) => Promise<void>;

  /**
   * ranges of ports to use to run the app server.
   */
  portRange?: number[];
};
