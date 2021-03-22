import { AppContext } from './app-context';
import { ServeAppOptions } from './application.main.runtime';

export interface Application {
  /**
   * name of the application. e.g. ripple-ci.
   */
  name: string;

  /**
   * range of allowed ports.
   */
  portRange?: number[];

  /**
   * serve the application.
   */
  serve(options: ServeAppOptions): Promise<void>;

  /**
   * start the application at dev mode.
   */
  dev?(context: AppContext): Promise<void>;

  /**
   * application deployment.
   */
  deploy?(): Promise<void>;
}
