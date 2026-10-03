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

  /**
   * mark this app as a "platform" — an app that bundles other apps' build artifacts (e.g. embeds a
   * frontend app and one or more backend apps). when true, the default `build_application` task
   * skips this app and a dedicated `build_platform_application` task runs it instead, after every
   * env has finished its `build_application`. this ensures the dependency apps' artifacts are on
   * disk by the time the platform's bundler reads them, regardless of cross-env ordering.
   */
  platform?: boolean;
}
