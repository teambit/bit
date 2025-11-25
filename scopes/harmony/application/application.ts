import type { AppContext } from './app-context';
import type { AppDeployContext } from './app-deploy-context';
import type { AppBuildContext } from './app-build-context';
import type { AppBuildResult } from './app-build-result';
import type { ApplicationDeployment, ApplicationInstance } from './app-instance';

export type DeployFn = (context: AppDeployContext) => Promise<ApplicationDeployment | void | undefined>;

export type BuildFn = (context: AppBuildContext) => Promise<AppBuildResult>;

export type AppResult = {
  port?: number;
  errors?: Error[];
};

export interface Application {
  /**
   * name of the application. e.g. ripple-ci.
   */
  name: string;

  /**
   * run the application.
   */
  run(context: AppContext): Promise<ApplicationInstance | number>;

  /**
   * build the application.
   */
  build?: BuildFn;

  /**
   * application deployment. this is a build task.
   */
  deploy?: DeployFn;

  /**
   * Type of the application
   */
  applicationType?: string;
}
