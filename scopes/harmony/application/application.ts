import { AppContext } from './app-context';
import { AppDeployContext } from './app-deploy-context';
import { AppBuildContext } from './app-build-context';
import { AppBuildResult } from './app-build-result';
import { ApplicationInstance } from './app-instance';

export type DeployFn = (context: AppDeployContext) => Promise<void>;

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
  run(context: AppContext): Promise<ApplicationInstance>;

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
