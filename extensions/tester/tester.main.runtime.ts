import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Component } from '@teambit/component';
import { EnvsAspect, EnvsMain } from '@teambit/environments';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { merge } from 'lodash';

import { TestCmd } from './test.cmd';
import { TesterAspect } from './tester.aspect';
import { TesterService } from './tester.service';
import { TesterTask } from './tester.task';
import { LoggerAspect, LoggerMain } from '@teambit/logger';

export type TesterExtensionConfig = {
  /**
   * regex of the text environment.
   */
  testRegex: string;
};

export type TesterOptions = {
  /**
   * start the tester in watch mode.
   */
  watch: boolean;

  /**
   * start the tester in debug mode.
   */
  debug: boolean;
};

export class TesterMain {
  static runtime = MainRuntime;
  static dependencies = [CLIAspect, EnvsAspect, WorkspaceAspect, LoggerAspect];

  constructor(
    /**
     * envs extension.
     */
    private envs: EnvsMain,

    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * tester service.
     */
    readonly service: TesterService,

    /**
     * build task.
     */
    readonly task: TesterTask
  ) {}

  async test(components: Component[], opts?: TesterOptions) {
    const options = this.getOptions(opts);
    const envRuntime = await this.envs.createEnvironment(components);
    const results = await envRuntime.run(this.service, options);
    return results;
  }

  private getOptions(options?: TesterOptions): TesterOptions {
    const defaults = {
      watch: false,
      debug: false,
    };

    return merge(defaults, options);
  }

  static defaultConfig = {
    /**
     * default test regex for which files tester to apply on.
     */
    testRegex: '*.{spec,test}.{js,jsx,ts,tsx}',
  };

  static async provider(
    [cli, envs, workspace, loggerAspect]: [CLIMain, EnvsMain, Workspace, LoggerMain],
    config: TesterExtensionConfig
  ) {
    const logger = loggerAspect.createLogger(TesterAspect.id);
    // @todo: Ran to fix.
    // @ts-ignore
    const tester = new TesterMain(
      envs,
      workspace,
      new TesterService(workspace, config.testRegex),
      new TesterTask(TesterAspect.id)
    );
    if (workspace && !workspace.consumer.isLegacy) {
      cli.unregister('test');
      cli.register(new TestCmd(tester, workspace, logger));
    }

    return tester;
  }
}

TesterAspect.addRuntime(TesterMain);
