import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentMain } from '@teambit/component';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { FormatterAspect } from './formatter.aspect';
import { FormatterService } from './formatter.service';
import { FormatTask } from './format.task';
import { FormatCmd } from './format.cmd';
import { FormatterOptions } from './formatter-context';

export type FormatterConfig = {};
export class FormatterMain {
  static runtime = MainRuntime;

  constructor(private envs: EnvsMain, private formatterService: FormatterService) {}

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

  static dependencies = [EnvsAspect, CLIAspect, ComponentAspect, LoggerAspect, WorkspaceAspect];

  static defaultConfig: FormatterConfig = {};

  static async provider(
    [envs, cli, component, loggerAspect, workspace]: [EnvsMain, CLIMain, ComponentMain, LoggerMain, Workspace],
    config: FormatterConfig
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const logger = loggerAspect.createLogger(FormatterAspect.id);
    const formatterService = new FormatterService(config);
    const formatterAspect = new FormatterMain(envs, formatterService);
    envs.registerService(formatterService);
    cli.register(new FormatCmd(formatterAspect, component.getHost(), workspace));

    return formatterAspect;
  }
}

FormatterAspect.addRuntime(FormatterMain);
