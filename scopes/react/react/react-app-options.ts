import { Bundler, DevServer } from '@teambit/bundler';

export type ReactAppOptions = {
  /**
   * name of the application.
   */
  name: string;

  /**
   * absolute path to entry files of the application.
   */
  entry: string[];

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
  deploy?: () => void;

  /**
   * ranges of ports to use to run the app server.
   */
  portRange?: number[];
};
