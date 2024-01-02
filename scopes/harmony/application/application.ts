import { AppContext } from './app-context';
import { AppDeployContext } from './app-deploy-context';
import { AppBuildContext } from './app-build-context';
import { AppBuildResult } from './app-build-result';
import { ApplicationDeployment, ApplicationInstance } from './app-instance';

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
