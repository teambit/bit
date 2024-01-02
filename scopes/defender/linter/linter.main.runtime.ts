import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentMain } from '@teambit/component';
import { EnvsAspect, EnvsMain, ExecutionContext } from '@teambit/envs';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { LinterAspect } from './linter.aspect';
import { LinterService } from './linter.service';
import { LintTask } from './lint.task';
import { LintCmd } from './lint.cmd';
import { FixTypes, LinterOptions } from './linter-context';
import { Linter } from './linter';

export type LinterConfig = {
  /**
   * extension formats to lint.
   */
  extensionFormats: string[];
  fixTypes?: FixTypes;
};

export class LinterMain {
  static runtime = MainRuntime;

  constructor(private envs: EnvsMain, private linterService: LinterService) {}

  /**
   * lint an array of components.
   */
  async lint(components: Component[], opts: LinterOptions) {
    const envsRuntime = await this.envs.createEnvironment(components);
    const lintResults = envsRuntime.run(this.linterService, opts);
    return lintResults;
  }

  getLinter(context: ExecutionContext, options: LinterOptions): Linter {
    return this.linterService.getLinter(context, options);
  }

  /**
   * create a lint task for build pipelines.
   * @param name name of the task.
   */
  createTask(name?: string): LintTask {
    return new LintTask(LinterAspect.id, name);
  }

  static dependencies = [EnvsAspect, CLIAspect, ComponentAspect, LoggerAspect, WorkspaceAspect];

  static defaultConfig: LinterConfig = {
    extensionFormats: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
    fixTypes: ['layout', 'problem', 'suggestion'],
  };

  static async provider(
    [envs, cli, component, loggerAspect, workspace]: [EnvsMain, CLIMain, ComponentMain, LoggerMain, Workspace],
    config: LinterConfig
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const logger = loggerAspect.createLogger(LinterAspect.id);
    const linterService = new LinterService(config, workspace);
    const linterAspect = new LinterMain(envs, linterService);
    envs.registerService(linterService);
    cli.register(new LintCmd(linterAspect, component.getHost(), workspace));

    return linterAspect;
  }
}

LinterAspect.addRuntime(LinterMain);
