import type { Component } from './component';
import type { Capsule } from './capsule';
import type { ArtifactDefinition, BuildContext } from './build';
import type { EnvContext, EnvHandler, Logger } from './env-handler';
import type { ExecutionContext } from './execution-context';

/**
 * the context Bit passes to an application when it runs.
 */
export interface AppContext extends ExecutionContext {
  /**
   * name of the app.
   */
  readonly appName: string;

  /**
   * determine whether to execute the app in dev mode.
   */
  readonly dev: boolean;

  /**
   * application component instance.
   */
  readonly appComponent: Component;

  /**
   * working directory of the component.
   */
  readonly workdir: string;

  /**
   * the execution context of the app.
   */
  readonly execContext: ExecutionContext;

  /**
   * a path to the host root dir.
   */
  readonly hostRootDir?: string;

  /**
   * a port to run the app on.
   */
  readonly port?: number;

  /**
   * arguments to pass to the app, e.g. the ones after `--` in `bit run`.
   */
  readonly args?: string;

  /**
   * path to the application component in the workspace.
   */
  readonly workspaceComponentPath?: string;

  /**
   * environment variables to pass to the app.
   */
  readonly envVariables: Record<string, string>;

  /**
   * create a logger for the app.
   */
  createLogger(name?: string): Logger;

  /**
   * get an instance of an aspect. make sure the aspect is loaded in the runtime.
   */
  getAspect<T>(aspectId: string): T | undefined;
}

/**
 * the context Bit passes to an application when it builds.
 */
export interface AppBuildContext extends AppContext, BuildContext {
  /**
   * determine whether to execute the app in dev mode.
   */
  readonly dev: boolean;

  /**
   * the context of the app.
   */
  readonly appContext: AppContext;

  /**
   * the capsule of the app component.
   */
  readonly capsule: Capsule;

  /**
   * name of the app.
   */
  readonly name: string;

  /**
   * the directory to write the app artifacts to.
   */
  readonly artifactsDir: string;
}

/**
 * an artifact of the build, as an application deployer sees it.
 */
export interface Artifact {
  readonly name: string;
  readonly description?: string;
  readonly generatedBy: string;
  readonly artifactDir: string | undefined;
  readonly files: { readonly paths: string[] };
  isEmpty(): boolean;
}

export interface ArtifactList extends ReadonlyArray<Artifact> {
  findByName(name: string): Artifact | undefined;
  findByTaskName(name: string): Artifact | undefined;
  isEmpty(): boolean;
}

/**
 * the context Bit passes to an application when it deploys.
 */
export interface AppDeployContext extends AppBuildContext {
  /**
   * the artifacts of the app build.
   */
  readonly artifacts: ArtifactList;

  /**
   * the public dir of the app.
   */
  readonly publicDir?: string;

  /**
   * the public dir of the app's SSR bundle.
   */
  readonly ssrPublicDir?: string;
}

export interface AppBuildResult {
  /**
   * artifacts to persist.
   */
  artifacts?: ArtifactDefinition[];

  /**
   * errors thrown during the build process.
   */
  errors?: Error[];

  /**
   * warnings thrown during the build process.
   */
  warnings?: string[];

  /**
   * metadata to persist.
   * this is the only property that actually gets saved into the objects (in builder aspect, aspectsData.buildDeployContexts[deployContext]).
   * in some scenarios, the build and deploy pipelines run in different processes, and then the only data the deploy
   * gets is what saved into the objects.
   * examples of data that gets save here:
   * React: { publicDir, ssrPublicDir }.
   * Node: { mainFile, artifactsDir }.
   */
  metadata?: Record<string, any>;
}

export type ApplicationInstance = {
  /**
   * port of the running app.
   */
  port?: number;

  /**
   * name of the app.
   */
  appName?: string;

  /**
   * url of the running app.
   */
  url?: string;

  /**
   * stop the running app.
   */
  stop?: () => Promise<void>;
};

export type ApplicationDeployment = {
  timestamp?: string;
  appName?: string;
  url?: string;
};

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
   * build the application. a method, not a `BuildFn` property, so apps typed with the application
   * aspect's contexts fit too.
   */
  build?(context: AppBuildContext): Promise<AppBuildResult>;

  /**
   * application deployment. this is a build task.
   */
  deploy?(context: AppDeployContext): Promise<ApplicationDeployment | void | undefined>;

  /**
   * Type of the application
   */
  applicationType?: string;
}

export interface ApplicationType<T> {
  /**
   * name of the type. e.g. react-app, node-app.
   */
  name: string;

  /**
   * a glob pattern of the files to detect the app.
   */
  globPattern?: string;

  /**
   * a factory function to create an application.
   */
  createApp(options: T): Application;
}

export type AppTypeListOptions = {
  name?: string;
};

export class AppTypeList {
  constructor(
    readonly name: string,
    private appTypes: EnvHandler<ApplicationType<any>>[],
    private context: EnvContext
  ) {}

  compute(): ApplicationType<any>[] {
    return this.appTypes.map((appType) => appType(this.context));
  }

  static from(appTypes: EnvHandler<ApplicationType<any>>[], options: AppTypeListOptions = {}): EnvHandler<AppTypeList> {
    return (context: EnvContext) => {
      const name = options.name || 'app-type-list';
      return new AppTypeList(name, appTypes, context);
    };
  }
}
