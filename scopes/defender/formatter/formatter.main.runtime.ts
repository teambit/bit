import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentMain } from '@teambit/component';
import { EnvsAspect, EnvsMain, ExecutionContext } from '@teambit/envs';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { FormatterAspect } from './formatter.aspect';
import { FormatterService } from './formatter.service';
import { FormatTask } from './format.task';
import { FormatCmd } from './format.cmd';
import { FormatterOptions } from './formatter-context';
import { Formatter } from './formatter';
import { SnappingAspect, SnappingMain } from '@teambit/snapping';

export type FormatterConfig = {
  formatOnPreSnap?: boolean;
};
export class FormatterMain {
  static runtime = MainRuntime;

  constructor(
    private envs: EnvsMain,
    private formatterService: FormatterService,
    private logger: Logger
  ) {}

  /**
   * format an array of components.
   */
  async format(components: Component[], opts: FormatterOptions) {
    const envsRuntime = await this.envs.createEnvironment(components);
    const formatResults = envsRuntime.run(this.formatterService, this.toFormatServiceOptions(opts, false));
    return formatResults;
  }

  /**
   * check format an array of components.
   */
  async check(components: Component[], opts: FormatterOptions) {
    const envsRuntime = await this.envs.createEnvironment(components);
    const formatResults = envsRuntime.run(this.formatterService, this.toFormatServiceOptions(opts, true));
    return formatResults;
  }

  getFormatter(context: ExecutionContext, options: FormatterOptions): Formatter {
    return this.formatterService.getFormatter(context, options);
  }

  private toFormatServiceOptions(opts: FormatterOptions, check = false): FormatterOptions {
    return {
      ...opts,
      check,
    };
  }

  /**
   * create a format task for build pipelines.
   * @param name name of the task.
   */
  createTask(name?: string): FormatTask {
    return new FormatTask(FormatterAspect.id, name);
  }

  static dependencies = [EnvsAspect, CLIAspect, ComponentAspect, LoggerAspect, WorkspaceAspect, SnappingAspect];

  static defaultConfig: FormatterConfig = {};

  static async provider(
    [envs, cli, component, loggerAspect, workspace, snapping]: [
      EnvsMain,
      CLIMain,
      ComponentMain,
      LoggerMain,
      Workspace,
      SnappingMain,
    ],
    config: FormatterConfig
  ) {
    const logger = loggerAspect.createLogger(FormatterAspect.id);
    const formatterService = new FormatterService(config);
    const formatterMain = new FormatterMain(envs, formatterService, logger);
    envs.registerService(formatterService);
    cli.register(new FormatCmd(formatterMain, component.getHost(), workspace));
    snapping.registerOnPreSnap(async (components) => {
      if (!config.formatOnPreSnap) {
        return;
      }
      await formatterMain.format(components, { check: false });
    });

    return formatterMain;
  }
}

FormatterAspect.addRuntime(FormatterMain);
