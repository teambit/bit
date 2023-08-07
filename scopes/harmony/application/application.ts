import { Logger } from '@teambit/logger';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { PubsubMain } from '@teambit/pubsub';
import { AppContext } from './app-context';
import { AppDeployContext } from './app-deploy-context';
import { AppBuildContext } from './app-build-context';
import { AppBuildResult } from './app-build-result';

export type DeployFn = (context: AppDeployContext) => Promise<void>;

// TODO: @nacho not sure if we need the dep Resolver and pubsub here
export interface AppPostbuildContext extends AppBuildContext {
  publicDir: string;
  logger: Logger;
  workspacePath: string;
  dependencyResolver?: DependencyResolverMain;
  pubsub?: PubsubMain;
}

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
  run(context: AppContext): Promise<number | void>;

  /**
   * run the application in ssr mode
   */
  runSsr?(context: AppContext): Promise<AppResult>;

  /**
   * build the application.
   */
  build?(context: AppBuildContext): Promise<AppBuildResult>;

  /**
   * application deployment. this is a build task.
   */
  deploy?: DeployFn;

  /**
   * Type of the application
   */
  applicationType?: string;

  /**
   * get the post build task.
   */
  getPostBuild?(context: AppBuildContext): Promise<void>;
}
