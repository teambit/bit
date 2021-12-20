import { BuildContext } from '@teambit/builder';
import { Capsule } from '@teambit/isolator';
import { AppContext } from './app-context';
import { DeployContext } from './deploy-context';

export interface Application {
  /**
   * name of the application. e.g. ripple-ci.
   */
  name: string;

  /**
   * run the application.
   */
  run(context: AppContext): Promise<number | void>;

  /**
   * build the application.
   */
  build?(context: BuildContext, aspectId: string, capsule: Capsule): Promise<DeployContext>;

  /**
   * application deployment. this is a build task.
   */
  deploy?(context: BuildContext, capsule: Capsule): Promise<void>;
}
