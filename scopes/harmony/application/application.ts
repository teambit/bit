import { BuildContext, BuiltTaskResult } from '@teambit/builder';
import { AppContext } from './app-context';

export interface Application {
  /**
   * name of the application. e.g. ripple-ci.
   */
  name: string;

  /**
   * run the application.
   */
  run(context: AppContext): Promise<void>;

  /**
   * application deployment. this is a build task.
   */
  deploy?(context: BuildContext): Promise<BuiltTaskResult>;
}
