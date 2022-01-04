import { BuildContext } from '@teambit/builder';
import { Capsule } from '@teambit/isolator';
import { AppContext } from './app-context';
import { DeployContext } from './deploy-context';
import { AppBuildResult } from './app-build-result';

export type DeployFn = (context: DeployContext, capsule: Capsule) => Promise<void>;

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
  build?(context: BuildContext, capsule: Capsule): Promise<AppBuildResult>;

  /**
   * application deployment. this is a build task.
   */
  deploy?: DeployFn;
}
