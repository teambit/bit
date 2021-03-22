import { MainRuntime, CLIMain, CLIAspect } from '@teambit/cli';
import { flatten } from 'lodash';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { ApplicationType } from './application-type';
import { Application } from './application';
import { AppNotFound } from './exceptions';
import { ApplicationAspect } from './application.aspect';
import { AppListCmd } from './app-list.cmd';
import { DeployTask } from './deploy.task';

export type ApplicationTypeSlot = SlotRegistry<ApplicationType[]>;
export type ApplicationSlot = SlotRegistry<Application[]>;

export type ApplicationAspectConfig = {};

export type ServeAppOptions = {
  /**
   * default port range used to serve applications.
   */
  defaultPortRange?: number[];
};

export class ApplicationMain {
  constructor(private appSlot: ApplicationSlot, private appTypeSlot: ApplicationTypeSlot) {}

  /**
   * register a new application type. One can be `React` or `Angular`.
   */
  registerAppType(appType: ApplicationType) {
    this.appTypeSlot.register([appType]);
    return this;
  }

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
   * get app to throw.
   */
  getAppOrThrow(appName: string) {
    const app = this.getApp(appName);
    if (!app) throw new AppNotFound();
    return app;
  }

  private computeOptions(opts: Partial<ServeAppOptions>) {
    const defaultOpts: ServeAppOptions = {
      defaultPortRange: [3100, 3500],
    };

    return {
      defaultOpts,
      ...opts,
    };
  }

  async serveApp(appName: string, options: Partial<ServeAppOptions> = {}) {
    const app = this.getAppOrThrow(appName);
    const opts = this.computeOptions(options);
    await app.serve(opts);
    return app;
  }

  private createAppContext() {
    return '';
  }

  devApp(appName: string) {
    const app = this.getAppOrThrow(appName);
    if (!app.dev) return this.serveApp(appName);
    return app.dev(this.createAppContext());
  }

  static runtime = MainRuntime;

  static dependencies = [CLIAspect, LoggerAspect, BuilderAspect];

  static slots = [Slot.withType<ApplicationType[]>(), Slot.withType<Application[]>()];

  static async provider(
    [cli, loggerAspect, builder]: [CLIMain, LoggerMain, BuilderMain],
    config: ApplicationAspectConfig,
    [appTypeSlot, appSlot]: [ApplicationTypeSlot, ApplicationSlot]
  ) {
    const logger = loggerAspect.createLogger(ApplicationAspect.id);
    const application = new ApplicationMain(appSlot, appTypeSlot);
    builder.registerDeployTasks([new DeployTask(application)]);
    cli.register(
      // new ServeCmd(application, logger),
      new AppListCmd(application)
    );

    return application;
  }
}

ApplicationAspect.addRuntime(ApplicationMain);
