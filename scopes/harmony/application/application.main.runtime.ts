import { MainRuntime, CLIMain, CLIAspect } from '@teambit/cli';
import { compact, flatten, head } from 'lodash';
import { AspectLoaderMain, AspectLoaderAspect } from '@teambit/aspect-loader';
import { Slot, SlotRegistry } from '@teambit/harmony';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { BitError } from '@teambit/bit-error';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { EnvDefinition, EnvsAspect, EnvsMain } from '@teambit/envs';
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
  appName?: string;
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
  envsAppsLoaded = false;

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
  async listApps(): Promise<Application[]> {
    await this.registerEnvsAppsAndReloadApps();
    return flatten(this.appSlot.values());
  }

  /**
   * map all apps by component ID.
   */
  async mapApps() {
    const countAppTypesWithoutEnvs = this.appTypeSlot.map.size;
    await this.registerEnvsAppsAndReloadApps();
    const countAppTypesWithEnvs = this.appTypeSlot.map.size;
    if (countAppTypesWithoutEnvs !== countAppTypesWithEnvs) {
      await this.workspace.loadAspects(this.aspectLoader.getNotLoadedConfiguredExtensions(), undefined, 'load apps');
    }
    return this.appSlot.toArray();
  }

  /**
   * list apps by a component id.
   */
  async listAppsById(id?: ComponentID): Promise<Application[] | undefined> {
    if (!id) return undefined;
    await this.registerEnvsAppsAndReloadApps(id);
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
  async calculateAppByComponent(component: Component) {
    await this.registerEnvsAppsAndReloadApps(component);
    const apps = this.appSlot.get(component.id.toString());
    if (!apps) return undefined;
    return head(apps);
  }

  /**
   * get an app.
   */
  async getApp(appName: string, id?: ComponentID): Promise<Application | undefined> {
    const apps = id ? await this.listAppsById(id) : await this.listApps();
    if (!apps) return undefined;
    return apps.find((app) => app.name === appName);
  }

  async getAppByNameOrId(appNameOrId: string): Promise<Application | undefined> {
    const byName = await this.getApp(appNameOrId);
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
  async getAppOrThrow(appName: string): Promise<Application> {
    const app = await this.getAppByNameOrId(appName);
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

  async runApp(appName: string, options?: ServeAppOptions) {
    options = this.computeOptions(options);
    const app = await this.getAppOrThrow(appName);
    const context = await this.createAppContext(app.name);
    if (!context) throw new AppNotFound(appName);

    if (options.ssr) {
      if (!app.runSsr) throw new AppNoSsr(appName);

      const result = await app.runSsr(context);
      return { app, ...result };
    }

    const port = await app.run(context);
    if (options.watch) {
      this.workspace.watcher
        .watchAll({
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

  /**
   * This will register the app types coming from the envs as plugins
   * Then it will reload the aspects configured in the workspace.jsonc if necessary
   */
  async registerEnvsAppsAndReloadApps(originComponent?: Component) {
    const countAppTypesWithoutEnvs = this.appTypeSlot.map.size;
    await this.registerEnvsApps(originComponent);
    const countAppTypesWithEnvs = this.appTypeSlot.map.size;
    /**
     * In case the envs added new plugins, we need to reload the aspects configured in the workspace.jsonc
     */
    if (countAppTypesWithoutEnvs !== countAppTypesWithEnvs) {
      await this.workspace.loadAspects(this.aspectLoader.getNotLoadedConfiguredExtensions(), undefined, 'load apps');
    }
  }

  async registerEnvsApps(originComponent?: Component) {
    if (this.envsAppsLoaded) return;
    const appTypes = await this.listEnvAppTypes(undefined, originComponent);
    if (!appTypes || !appTypes.length) return;
    appTypes.forEach((appType) => this.registerAppType(appType));
    this.envsAppsLoaded = true;
  }

  async listEnvAppTypes(ids: string[] = [], originComponent?: Component): Promise<Array<ApplicationType<any>>> {
    const originId = originComponent?.id;
    const configEnvs = this.config.envs || [];
    if (
      originId
      ) {
      // If the component we are loading now is core aspect we want to skip this
      if (this.aspectLoader.isCoreAspect(originId.toStringWithoutVersion())) return [];
      // If we are now loading the env itself, no point to continue the process
      if (configEnvs.includes(originId.toString()) || configEnvs.includes(originId.toStringWithoutVersion())) return [];
      const originEnvId = this.envs.getEnvId(originComponent);
      const originEnvIdWithoutVersion = originEnvId.split('@')[0];
      // If the env of the current component is not in the list of configured envs, no point to load them now
      if (!configEnvs.includes(originEnvId) && !configEnvs.includes(originEnvIdWithoutVersion)) return [];
    }
    const envs = await this.loadEnvs(configEnvs?.concat(ids));
    const appTypes = envs.flatMap((env) => {
      if (!env.env.getAppTypes) return [];
      const currAppTypes = env.env.getAppTypes() || [];
      return currAppTypes;
    });

    return appTypes;
  }

  private async loadEnvs(ids: string[] = this.config.envs || []): Promise<EnvDefinition[]> {
    const host = this.componentAspect.getHost();
    if (!host) return [];
    await host.loadAspects(ids);

    const potentialEnvs = ids.map((id) => {
      const componentId = ComponentID.fromString(id);
      return this.envs.getEnvDefinition(componentId);
    });

    return compact(potentialEnvs);
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
      config,
      envs,
      component,
      appService,
      aspectLoader,
      workspace,
      logger
    );
    const appCmd = new AppCmd();
    appCmd.commands = [new AppListCmd(application), new RunCmd(application, logger)];
    aspectLoader.registerPlugins([new AppPlugin(appSlot)]);
    // await application.registerEnvsApps();
    builder.registerBuildTasks([new AppsBuildTask(application)]);
    builder.registerSnapTasks([new DeployTask(application, builder)]);
    builder.registerTagTasks([new DeployTask(application, builder)]);
    cli.registerGroup('apps', 'Applications');
    cli.register(new RunCmd(application, logger), new AppListCmdDeprecated(application), appCmd);
    if (workspace) {
      workspace.onComponentLoad(async (loadedComponent) => {
        const app = await application.calculateAppByComponent(loadedComponent);
        if (!app) return {};
        return {
          appName: app?.name,
          type: app?.applicationType,
        };
      });
    }

    return application;
  }
}

ApplicationAspect.addRuntime(ApplicationMain);
