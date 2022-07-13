import { MainRuntime, CLIMain, CLIAspect } from '@teambit/cli';
import { flatten, cloneDeep } from 'lodash';
import { AspectLoaderMain, AspectLoaderAspect } from '@teambit/aspect-loader';
import { Slot, SlotRegistry } from '@teambit/harmony';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import ComponentAspect, { ComponentMain, ComponentID } from '@teambit/component';
import { ApplicationType } from './application-type';
import { Application } from './application';
import { DeploymentProvider } from './deployment-provider';
import { AppNotFound } from './exceptions';
import { ApplicationAspect } from './application.aspect';
import { AppListCmdDeprecated } from './app-list.cmd';
import { AppsBuildTask } from './build.task';
import { RunCmd } from './run.cmd';
import { AppService } from './application.service';
import { AppCmd, AppListCmd } from './app.cmd';
import { AppPlugin } from './app.plugin';
import { AppTypePlugin } from './app-type.plugin';
import { AppContext } from './app-context';
import { DeployTask } from './deploy.task';

export type ApplicationTypeSlot = SlotRegistry<ApplicationType<unknown>[]>;
export type ApplicationSlot = SlotRegistry<Application[]>;
export type DeploymentProviderSlot = SlotRegistry<DeploymentProvider[]>;

export type ApplicationAspectConfig = {};

export type ServeAppOptions = {
  /**
   * default port range used to serve applications.
   */
  defaultPortRange?: number[];

  /**
   * determine whether to start the application in dev mode.
   */
  dev: boolean;
};

export class ApplicationMain {
  constructor(
    private appSlot: ApplicationSlot,
    private appTypeSlot: ApplicationTypeSlot,
    private deploymentProviderSlot: DeploymentProviderSlot,
    private envs: EnvsMain,
    private componentAspect: ComponentMain,
    private appService: AppService,
    private aspectLoader: AspectLoaderMain,
    private workspace: Workspace,
    private logger: Logger
  ) {}

  /**
   * register a new app.
   */
  registerApp(app: Application) {
    this.appSlot.register([app]);
    return this;
  }

  /**
   * list all registered apps.
   */
  listApps(): Application[] {
    return flatten(this.appSlot.values());
  }

  /**
   * map all apps by component ID.
   */
  mapApps() {
    return this.appSlot.toArray();
  }

  /**
   * list apps by a component id.
   */
  listAppsById(id?: ComponentID): Application[] | undefined {
    if (!id) return undefined;
    return this.appSlot.get(id.toString());
  }

  /**
   * get an app.
   */
  getApp(appName: string, id?: ComponentID): Application | undefined {
    const apps = this.listAppsById(id) || this.listApps();
    return apps.find((app) => app.name === appName);
  }

  /**
   * registers a new app and sets a plugin for it.
   */
  registerAppType<T>(appType: ApplicationType<T>) {
    const plugin = new AppTypePlugin(`*.${appType.name}.*`, appType, this.appSlot);
    this.aspectLoader.registerPlugins([plugin]);
    this.appTypeSlot.register([appType]);
    return this;
  }

  /**
   * get an app AspectId.
   */
  getAppAspect(appName: string): string | undefined {
    return this.appSlot.toArray().find(([, apps]) => apps.find((app) => app.name === appName))?.[0];
  }

  /**
   * get app to throw.
   */
  getAppOrThrow(appName: string) {
    const app = this.getApp(appName);
    if (!app) throw new AppNotFound(appName);
    return app;
  }

  private computeOptions(opts: Partial<ServeAppOptions>) {
    const defaultOpts: ServeAppOptions = {
      dev: false,
      defaultPortRange: [3100, 3500],
    };

    return {
      defaultOpts,
      ...opts,
    };
  }

  async runApp(appName: string, options: Partial<ServeAppOptions> & { skipWatch?: boolean } = {}) {
    const app = this.getAppOrThrow(appName);
    this.computeOptions(options);
    const context = await this.createAppContext(appName);
    if (!context) throw new AppNotFound(appName);
    const port = await app.run(context);
    if (!options.skipWatch) {
      this.workspace.watcher
        .watchAll({
          preCompile: false,
        })
        .catch((err) => {
          // don't throw an error, we don't want to break the "run" process
          this.logger.error(`compilation failed`, err);
        });
    }
    return { app, port };
  }

  /**
   * get the component ID of a certain app.
   */
  getAppIdOrThrow(appName: string) {
    const maybeApp = this.appSlot.toArray().find(([, apps]) => {
      return apps.find((app) => app.name === appName);
    });

    if (!maybeApp) throw new AppNotFound(appName);
    return ComponentID.fromString(maybeApp[0]);
  }

  private async createAppContext(appName: string): Promise<AppContext> {
    const host = this.componentAspect.getHost();
    const components = await host.list();
    const id = this.getAppIdOrThrow(appName);
    const component = components.find((c) => c.id.isEqual(id));
    if (!component) throw new AppNotFound(appName);
    // console.log(comp)

    const env = await this.envs.createEnvironment([component]);
    const res = await env.run(this.appService);
    const context = res.results[0].data;
    if (!context) throw new AppNotFound(appName);
    const hostRootDir = this.workspace.getComponentPackagePath(component);
    return Object.assign(cloneDeep(context), {
      appName,
      appComponent: component,
      hostRootDir,
    });
  }

  static runtime = MainRuntime;
  static dependencies = [
    CLIAspect,
    LoggerAspect,
    BuilderAspect,
    EnvsAspect,
    ComponentAspect,
    AspectLoaderAspect,
    WorkspaceAspect,
  ];

  static slots = [
    Slot.withType<ApplicationType<unknown>[]>(),
    Slot.withType<Application[]>(),
    Slot.withType<DeploymentProvider[]>(),
  ];

  static async provider(
    [cli, loggerAspect, builder, envs, component, aspectLoader, workspace]: [
      CLIMain,
      LoggerMain,
      BuilderMain,
      EnvsMain,
      ComponentMain,
      AspectLoaderMain,
      Workspace
    ],
    config: ApplicationAspectConfig,
    [appTypeSlot, appSlot, deploymentProviderSlot]: [ApplicationTypeSlot, ApplicationSlot, DeploymentProviderSlot]
  ) {
    const logger = loggerAspect.createLogger(ApplicationAspect.id);
    const appService = new AppService();
    const application = new ApplicationMain(
      appSlot,
      appTypeSlot,
      deploymentProviderSlot,
      envs,
      component,
      appService,
      aspectLoader,
      workspace,
      logger
    );
    const appCmd = new AppCmd();
    appCmd.commands = [new AppListCmd(application)];
    aspectLoader.registerPlugins([new AppPlugin(appSlot)]);
    builder.registerBuildTasks([new AppsBuildTask(application)]);
    builder.registerSnapTasks([new DeployTask(application, builder)]);
    builder.registerTagTasks([new DeployTask(application, builder)]);
    cli.registerGroup('apps', 'Applications');
    cli.register(new RunCmd(application, logger), new AppListCmdDeprecated(application), appCmd);

    return application;
  }
}

ApplicationAspect.addRuntime(ApplicationMain);
