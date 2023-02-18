import { MainRuntime, CLIMain, CLIAspect } from '@teambit/cli';
import { compact, flatten, head } from 'lodash';
import { AspectLoaderMain, AspectLoaderAspect } from '@teambit/aspect-loader';
import { Slot, SlotRegistry } from '@teambit/harmony';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { BitError } from '@teambit/bit-error';
import WatcherAspect, { WatcherMain } from '@teambit/watcher';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import ComponentAspect, { ComponentMain, ComponentID, Component } from '@teambit/component';
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
import { AppNoSsr } from './exceptions/app-no-ssr';

export type ApplicationTypeSlot = SlotRegistry<ApplicationType<unknown>[]>;
export type ApplicationSlot = SlotRegistry<Application[]>;
export type DeploymentProviderSlot = SlotRegistry<DeploymentProvider[]>;

export type ApplicationAspectConfig = {
  /**
   * envs ids to load app types.
   */
  envs?: string[];
};

/**
 * Application meta data that is stored on the component on load if it's an application.
 */
export type ApplicationMetadata = {
  appName: string;
  type?: string;
};

export type ServeAppOptions = {
  /**
   * default port range used to serve applications.
   */
  defaultPortRange?: [start: number, end: number];

  /**
   * determine whether to start the application in dev mode.
   */
  dev: boolean;

  /**
   * actively watch and compile the workspace (like the bit watch command)
   * @default true
   */
  watch?: boolean;

  /**
   * determine whether to start the application in server side mode.
   * @default false
   */
  ssr?: boolean;
};

export class ApplicationMain {
  constructor(
    private appSlot: ApplicationSlot,
    // TODO unused
    private appTypeSlot: ApplicationTypeSlot,
    private deploymentProviderSlot: DeploymentProviderSlot,
    private config: ApplicationAspectConfig,
    private envs: EnvsMain,
    private componentAspect: ComponentMain,
    private appService: AppService,
    private aspectLoader: AspectLoaderMain,
    private workspace: Workspace,
    private logger: Logger,
    private watcher: WatcherMain
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
   * get an application by a component id.
   */
  async getAppById(id: ComponentID) {
    const apps = await this.listAppsById(id);
    if (!apps) return undefined;
    return head(apps);
  }

  /**
   * calculate an application by a component.
   * This should be only used during the on component load slot
   */
  calculateAppByComponent(component: Component) {
    const apps = this.appSlot.get(component.id.toString());
    if (!apps) return undefined;
    return head(apps);
  }

  listAppTypes() {
    return flatten(this.appTypeSlot.values());
  }

  async listAppsFromComponents() {
    const components = await this.componentAspect.getHost().list();
    const appTypesPatterns = this.getAppPatterns();
    const apps = components.filter((component) => {
      // has app plugin from registered types.
      const files = component.filesystem.byGlob(appTypesPatterns);
      return !!files.length;
    });

    return apps;
  }

  getAppPatterns() {
    const appTypes = this.listAppTypes();
    const appTypesPatterns = appTypes.map((appType) => {
      return this.getAppPattern(appType);
    });

    return appTypesPatterns;
  }

  async loadApps(): Promise<Application[]> {
    const apps = await this.listAppsFromComponents();
    const appTypesPatterns = this.getAppPatterns();

    const pluginsToLoad = apps.flatMap((appComponent) => {
      const files = appComponent.filesystem.byGlob(appTypesPatterns);
      return files.map((file) => file.path);
    });
    // const app = require(appPath);
    const appManifests = compact(
      pluginsToLoad.map((pluginPath) => {
        try {
          // eslint-disable-next-line
          const appManifest = require(pluginPath)?.default;
          return appManifest;
        } catch (err) {
          this.logger.error(`failed loading app manifest: ${pluginPath}`);
          return undefined;
        }
      })
    );

    return appManifests;
  }

  /**
   * get an app.
   */
  getApp(appName: string, id?: ComponentID): Application | undefined {
    const apps = id ? this.listAppsById(id) : this.listApps();
    if (!apps) return undefined;
    return apps.find((app) => app.name === appName);
  }

  getAppByNameOrId(appNameOrId: string): Application | undefined {
    const byName = this.getApp(appNameOrId);
    if (byName) return byName;
    const byId = this.appSlot.get(appNameOrId);
    if (!byId || !byId.length) return undefined;
    if (byId.length > 1) {
      throw new BitError(
        `unable to figure out what app to retrieve. the id "${appNameOrId}" has more than one app. please use the app-name`
      );
    }
    return byId[0];
  }

  getAppPattern(appType: ApplicationType<unknown>) {
    if (appType.globPattern) return appType.globPattern;
    return `*.${appType.name}.*`;
  }

  /**
   * registers a new app and sets a plugin for it.
   */
  registerAppType<T>(appType: ApplicationType<T>) {
    const plugin = new AppTypePlugin(this.getAppPattern(appType), appType, this.appSlot);
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
  getAppOrThrow(appName: string): Application {
    const app = this.getAppByNameOrId(appName);
    if (!app) throw new AppNotFound(appName);
    return app;
  }

  defaultOpts: ServeAppOptions = {
    dev: false,
    ssr: false,
    watch: true,
    defaultPortRange: [3100, 3500],
  };
  private computeOptions(opts: Partial<ServeAppOptions> = {}) {
    return {
      ...this.defaultOpts,
      ...opts,
    };
  }

  async loadAppsToSlot() {
    const apps = await this.loadApps();
    this.appSlot.register(apps);
    return this;
  }

  async runApp(appName: string, options?: ServeAppOptions) {
    options = this.computeOptions(options);
    const app = this.getAppOrThrow(appName);
    const context = await this.createAppContext(app.name);
    if (!context) throw new AppNotFound(appName);

    if (options.ssr) {
      if (!app.runSsr) throw new AppNoSsr(appName);

      const result = await app.runSsr(context);
      return { app, ...result };
    }

    const port = await app.run(context);
    if (options.watch) {
      this.watcher
        .watch({
          preCompile: false,
        })
        .catch((err) => {
          // don't throw an error, we don't want to break the "run" process
          this.logger.error(`compilation failed`, err);
        });
    }
    return { app, port, errors: undefined };
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

    const env = await this.envs.createEnvironment([component]);
    const res = await env.run(this.appService);
    const context = res.results[0].data;
    if (!context) throw new AppNotFound(appName);
    const hostRootDir = this.workspace.getComponentPackagePath(component);
    const appContext = new AppContext(appName, context.dev, component, this.workspace.path, context, hostRootDir);
    return appContext;
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
    WatcherAspect,
  ];

  static slots = [
    Slot.withType<ApplicationType<unknown>[]>(),
    Slot.withType<Application[]>(),
    Slot.withType<DeploymentProvider[]>(),
  ];

  static async provider(
    [cli, loggerAspect, builder, envs, component, aspectLoader, workspace, watcher]: [
      CLIMain,
      LoggerMain,
      BuilderMain,
      EnvsMain,
      ComponentMain,
      AspectLoaderMain,
      Workspace,
      WatcherMain
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
      config,
      envs,
      component,
      appService,
      aspectLoader,
      workspace,
      logger,
      watcher
    );
    appService.registerAppType = application.registerAppType.bind(application);
    const appCmd = new AppCmd();
    appCmd.commands = [new AppListCmd(application), new RunCmd(application, logger)];
    aspectLoader.registerPlugins([new AppPlugin(appSlot)]);
    builder.registerBuildTasks([new AppsBuildTask(application)]);
    builder.registerSnapTasks([new DeployTask(application, builder)]);
    builder.registerTagTasks([new DeployTask(application, builder)]);
    envs.registerService(appService);
    cli.registerGroup('apps', 'Applications');
    cli.register(new RunCmd(application, logger), new AppListCmdDeprecated(application), appCmd);
    // cli.registerOnStart(async () => {
    //   await application.loadAppsToSlot();
    // });
    if (workspace) {
      workspace.onComponentLoad(async (loadedComponent): Promise<ApplicationMetadata | undefined> => {
        const app = application.calculateAppByComponent(loadedComponent);
        if (!app) return undefined;
        return {
          appName: app.name,
          type: app.applicationType,
        };
      });
    }

    return application;
  }
}

ApplicationAspect.addRuntime(ApplicationMain);
