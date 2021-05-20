import { MainRuntime, CLIMain, CLIAspect } from '@teambit/cli';
import { flatten } from 'lodash';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import ComponentAspect, { ComponentMain, ComponentID } from '@teambit/component';
import { ApplicationType } from './application-type';
import { Application } from './application';
import { AppNotFound } from './exceptions';
import { ApplicationAspect } from './application.aspect';
import { AppListCmd } from './app-list.cmd';
import { DeployTask } from './deploy.task';
import { RunCmd } from './run.cmd';
import { AppService } from './application.service';

export type ApplicationTypeSlot = SlotRegistry<ApplicationType[]>;
export type ApplicationSlot = SlotRegistry<Application[]>;

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
    private envs: EnvsMain,
    private componentAspect: ComponentMain,
    private appService: AppService
  ) {}

  /**
   * register a new app.
   */
  registerApp(app: Application) {
    this.appSlot.register([app]);
    return this;
  }

  /**
   * register multiple apps.
   */
  registerApps(apps: Application[]) {
    this.appSlot.register(apps);
    return this;
  }

  /**
   * list all registered apps.
   */
  listApps(): Application[] {
    return flatten(this.appSlot.values());
  }

  /**
   * get an app.
   */
  getApp(appName: string): Application | undefined {
    const apps = this.listApps();
    return apps.find((app) => app.name === appName);
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

  async runApp(appName: string, options: Partial<ServeAppOptions> = {}) {
    const app = this.getAppOrThrow(appName);
    this.computeOptions(options);
    const context = await this.createAppContext(appName);
    if (!context) throw new AppNotFound(appName);
    const port = await app.run(context);
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

  private async createAppContext(appName: string) {
    const host = this.componentAspect.getHost();
    const id = this.getAppIdOrThrow(appName);
    const component = await host.get(id);
    if (!component) throw new AppNotFound(appName);

    const env = await this.envs.createEnvironment([component]);
    const res = await env.run(this.appService);
    return res.results[0].data;
  }

  static runtime = MainRuntime;
  static dependencies = [CLIAspect, LoggerAspect, BuilderAspect, EnvsAspect, ComponentAspect];

  static slots = [Slot.withType<ApplicationType[]>(), Slot.withType<Application[]>()];

  static async provider(
    [cli, loggerAspect, builder, envs, component]: [CLIMain, LoggerMain, BuilderMain, EnvsMain, ComponentMain],
    config: ApplicationAspectConfig,
    [appTypeSlot, appSlot]: [ApplicationTypeSlot, ApplicationSlot]
  ) {
    const logger = loggerAspect.createLogger(ApplicationAspect.id);
    const appService = new AppService();
    const application = new ApplicationMain(appSlot, appTypeSlot, envs, component, appService);
    builder.registerDeployTasks([new DeployTask(application)]);
    cli.registerGroup('apps', 'Applications');
    cli.register(new RunCmd(application, logger), new AppListCmd(application));

    return application;
  }
}

ApplicationAspect.addRuntime(ApplicationMain);
