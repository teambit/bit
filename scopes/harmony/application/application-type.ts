import { Application } from './application';

export interface ApplicationType<T> {
  /**
   * name of the type of the app. e.g. `react-app`
   */
  name: string;

  /**
   * a function that creates the app instance.
   */
  createApp(options: T): Application | Promise<Application>;
}
