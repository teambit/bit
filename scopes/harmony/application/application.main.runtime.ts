import type { CLIMain } from '@teambit/cli';
import { MainRuntime, CLIAspect } from '@teambit/cli';
import { compact, flatten, head } from 'lodash';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { AspectLoaderAspect } from '@teambit/aspect-loader';
import type { SlotRegistry, Harmony } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import { BitError } from '@teambit/bit-error';
import type { WatcherMain } from '@teambit/watcher';
import { WatcherAspect } from '@teambit/watcher';
import type { BuilderMain } from '@teambit/builder';
import { BuilderAspect } from '@teambit/builder';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import type { ComponentMain, ComponentID, Component } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import type { ApplicationType } from './application-type';
import type { Application } from './application';
import type { DeploymentProvider } from './deployment-provider';
import { AppNotFound } from './exceptions';
import { ApplicationAspect } from './application.aspect';
import { AppsBuildTask } from './build-application.task';
import { RunCmd } from './run.cmd';
import { AppService } from './application.service';
import { AppCmd, AppListCmd } from './app.cmd';
import { AppPlugin, BIT_APP_PATTERN } from './app.plugin';
import { AppTypePlugin } from './app-type.plugin';
import { AppContext } from './app-context';
import { DeployTask } from './deploy.task';

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

  /**
   * exact port to run the app
   */
  port?: number;

  /**
   * arguments passing to the app.
   */
  args?: string;
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
    private watcher: WatcherMain,
    private harmony: Harmony
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

  async listAppsIdsAndNames(): Promise<{ id: string; name: string }[]> {
    await this.loadAllAppsAsAspects();
    const appComponents = this.mapApps();
    return appComponents.flatMap(([id, apps]) => {
      return apps.map((app) => {
        if (!app.name) throw new BitError(`app ${id.toString()} is missing a name`);
        return { id, name: app.name };
      });
    });
  }

  /**
   * map all apps by component ID.
   */
  mapApps() {
    return this.appSlot.toArray();
  }

  /**
   * instead of adding apps to workspace.jsonc, this method gets all apps components and load them as aspects so then
   * they could register to the apps slots and be available to list/run etc.
   * if poolIds is provided, it will load only the apps that are part of the pool.
   */
  async loadAllAppsAsAspects(poolIds?: ComponentID[]): Promise<ComponentID[]> {
    const apps = await this.listAppsComponents(poolIds);
    if (!apps.length) return [];
    // do not load apps that their env was not loaded yet. their package-json may not be up to date. e.g. it could be
    // cjs, when the env needs it as esm. once it is loaded, node.js saved the package.json in the cache with no way to
    // refresh it.
    const appsWithEnvLoaded = apps.filter((app) => !app.state.issues.getIssueByName('NonLoadedEnv'));
    if (apps.length !== appsWithEnvLoaded.length) {
      this.logger.warn(`some apps were not loaded as aspects because their env was not loaded yet`);
    }
    const appIds = appsWithEnvLoaded.map((app) => app.id);
    await this.componentAspect.getHost().loadAspects(appIds.map((id) => id.toString()));
    return appIds;
  }

  /**
   * list apps by a component id.
   * make sure to call `this.loadAllAppsAsAspects` before calling this method in case the app is not listed in workspace.jsonc
   */
  listAppsById(id?: ComponentID): Application[] | undefined {
    if (!id) return undefined;
    return this.appSlot.get(id.toString());
  }

  /**
   * get an application by a component id.
   * make sure to call `this.loadAllAppsAsAspects` before calling this method in case the app is not listed in workspace.jsonc
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

  /**
   * @deprecated use `listAppsComponents` instead.
   * @returns
   */
  async listAppsFromComponents(): Promise<Component[]> {
    return this.listAppsComponents();
  }

  /**
   * list all components that are apps.
   * if poolIds is provided, it will load only the apps that are part of the pool.
   */
  async listAppsComponents(poolIds?: ComponentID[]): Promise<Component[]> {
    const host = this.workspace || this.componentAspect.getHost();
    if (!host) return [];
    const components = poolIds
      ? this.workspace
        ? await this.workspace.getMany(poolIds, {
            loadExtensions: true,
            executeLoadSlot: true,
            loadSeedersAsAspects: true,
          })
        : await host.getMany(poolIds)
      : await host.list();
    const appTypesPatterns = this.getAppPatterns();
    const appsComponents = components.filter((component) => this.hasAppTypePattern(component, appTypesPatterns));
    return appsComponents;
  }

  private hasAppTypePattern(component: Component, appTypesPatterns?: string[]): boolean {
    const patterns = appTypesPatterns || this.getAppPatterns();
    // has app plugin from registered types.
    const files = component.filesystem.byGlob(patterns);
    return !!files.length;
  }

  getAppPatterns() {
    const appTypes = this.listAppTypes();
    const appTypesPatterns = appTypes.map((appType) => {
      return this.getAppPattern(appType);
    });

    return appTypesPatterns.concat(BIT_APP_PATTERN);
  }

  async loadApps(): Promise<Application[]> {
    const apps = await this.listAppsComponents();
    const appTypesPatterns = this.getAppPatterns();

    const pluginsToLoad = apps.flatMap((appComponent) => {
      const files = appComponent.filesystem.byGlob(appTypesPatterns);
      return files.map((file) => file.path);
    });

    // const app = require(appPath);
    const appManifests = Promise.all(
      compact(
        pluginsToLoad.map(async (pluginPath) => {
          try {
            const isModule = await this.aspectLoader.isEsmModule(pluginPath);
            if (isModule) {
              const appManifest = await this.aspectLoader.loadEsm(pluginPath);
              return appManifest;
            }
            // eslint-disable-next-line
            const appManifest = require(pluginPath)?.default;
            return appManifest;
          } catch {
            this.logger.error(`failed loading app manifest: ${pluginPath}`);
            return undefined;
          }
        })
      )
    );

    return appManifests;
  }

  async loadAppsFromComponent(component: Component, rootDir: string): Promise<Application[] | undefined> {
    const appTypesPatterns = this.getAppPatterns();
    const isApp = this.hasAppTypePattern(component, appTypesPatterns);
    if (!isApp) return undefined;

    const allPluginDefs = this.aspectLoader.getPluginDefs();

    const appsPluginDefs = allPluginDefs.filter((pluginDef) => {
      return appTypesPatterns.includes(pluginDef.pattern.toString());
    });
    // const fileResolver = this.aspectLoader.pluginFileResolver(component, rootDir);

    const plugins = this.aspectLoader.getPluginsFromDefs(component, rootDir, appsPluginDefs);
    let loadedPlugins;
    if (plugins.has()) {
      loadedPlugins = await plugins.load(MainRuntime.name);
      await this.aspectLoader.loadExtensionsByManifests([loadedPlugins], { seeders: [component.id.toString()] });
    }

    const listAppsById = this.listAppsById(component.id);
    return listAppsById;
  }

  /**
   * get an app.
   * make sure to call `this.loadAllAppsAsAspects` before calling this method in case the app is not listed in workspace.jsonc
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
  registerAppType<T>(...appTypes: Array<ApplicationType<T>>) {
    const plugins = appTypes.map((appType) => {
      return new AppTypePlugin(this.getAppPattern(appType), appType, this.appSlot);
    });

    this.aspectLoader.registerPlugins(plugins);
    this.appTypeSlot.register(appTypes);
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
   * make sure to call `this.loadAllAppsAsAspects` before calling this method in case the app is not listed in workspace.jsonc
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

  /**
   * run an app.
   * make sure to call `this.loadAllAppsAsAspects` before calling this method in case the app is not listed in workspace.jsonc
   */
  async runApp(
    appName: string,
    options?: ServeAppOptions
  ): Promise<{
    app: Application;
    port: number | undefined;
    errors?: Error[];
    isOldApi: boolean;
  }> {
    await this.workspace.setComponentPathsRegExps();
    options = this.computeOptions(options);
    const app = this.getAppOrThrow(appName);
    const context = await this.createAppContext(app.name, options.port, options.args);
    if (!context) throw new AppNotFound(appName);

    const instance = await app.run(context);
    if (options.watch) {
      this.watcher
        .watch({
          preCompile: false,
          compile: true,
        })
        .catch((err) => {
          // don't throw an error, we don't want to break the "run" process
          this.logger.error(`compilation failed`, err);
        });
    }

    const isOldApi = typeof instance === 'number';
    const port = isOldApi ? instance : instance?.port;

    return { app, port, errors: undefined, isOldApi };
  }

  /**
   * get the component ID of a certain app.
   */
  async getAppIdOrThrow(appName: string) {
    const maybeApp = this.appSlot.toArray().find(([, apps]) => {
      return apps.find((app) => app.name === appName);
    });

    if (!maybeApp) throw new AppNotFound(appName);

    const host = this.componentAspect.getHost();
    return host.resolveComponentId(maybeApp[0]);
  }

  private async createAppContext(appName: string, port?: number, args?: string): Promise<AppContext> {
    const host = this.componentAspect.getHost();
    // const components = await host.list();
    const id = await this.getAppIdOrThrow(appName);
    // const component = components.find((c) => c.id.isEqual(id));
    const component = await host.get(id);
    if (!component) throw new AppNotFound(appName);

    const env = await this.envs.createEnvironment([component]);
    const res = await env.run(this.appService);
    const context = res.results[0].data;
    if (!context) throw new AppNotFound(appName);
    const hostRootDir = await this.workspace.getComponentPackagePath(component);
    const workspaceComponentDir = this.workspace.componentDir(component.id);

    const appContext = new AppContext(
      appName,
      this.harmony,
      context.dev,
      component,
      this.workspace.path,
      context,
      hostRootDir,
      port,
      args,
      workspaceComponentDir
    );
    return appContext;
  }

  async createAppBuildContext(id: ComponentID, appName: string, capsuleRootDir: string, rootDir?: string) {
    const host = this.componentAspect.getHost();
    // const components = await host.list();
    // const component = components.find((c) => c.id.isEqual(id));
    const component = await host.get(id);
    if (!component) throw new AppNotFound(appName);

    const env = await this.envs.createEnvironment([component]);
    const res = await env.run(this.appService);
    const context = res.results[0].data;
    if (!context) throw new AppNotFound(appName);

    const appContext = new AppContext(
      appName,
      this.harmony,
      context.dev,
      component,
      capsuleRootDir,
      context,
      rootDir,
      undefined,
      undefined,
      undefined,
      undefined
    );
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
    ScopeAspect,
  ];

  static slots = [
    Slot.withType<ApplicationType<unknown>[]>(),
    Slot.withType<Application[]>(),
    Slot.withType<DeploymentProvider[]>(),
  ];

  static async provider(
    [cli, loggerAspect, builder, envs, component, aspectLoader, workspace, watcher, scope]: [
      CLIMain,
      LoggerMain,
      BuilderMain,
      EnvsMain,
      ComponentMain,
      AspectLoaderMain,
      Workspace,
      WatcherMain,
      ScopeMain,
    ],
    config: ApplicationAspectConfig,
    [appTypeSlot, appSlot, deploymentProviderSlot]: [ApplicationTypeSlot, ApplicationSlot, DeploymentProviderSlot],
    harmony: Harmony
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
      watcher,
      harmony
    );
    appService.registerAppType = application.registerAppType.bind(application);
    const appCmd = new AppCmd(application);
    appCmd.commands = [new AppListCmd(application), new RunCmd(application, logger)];
    aspectLoader.registerPlugins([new AppPlugin(appSlot)]);
    builder.registerBuildTasks([new AppsBuildTask(application)]);
    builder.registerSnapTasks([new DeployTask(application, builder)]);
    builder.registerTagTasks([new DeployTask(application, builder)]);
    envs.registerService(appService);
    cli.registerGroup('apps', 'Applications');
    cli.register(new RunCmd(application, logger), appCmd);
    // cli.registerOnStart(async () => {
    //   await application.loadAppsToSlot();
    // });
    const calcAppOnLoad = async (loadedComponent): Promise<ApplicationMetadata | undefined> => {
      const app = application.calculateAppByComponent(loadedComponent);
      if (!app) return undefined;
      return {
        appName: app.name,
        type: app.applicationType,
      };
    };
    if (workspace) {
      workspace.registerOnComponentLoad(calcAppOnLoad);
    }
    if (scope) {
      scope.registerOnCompAspectReCalc(calcAppOnLoad);
    }

    return application;
  }
}

ApplicationAspect.addRuntime(ApplicationMain);
