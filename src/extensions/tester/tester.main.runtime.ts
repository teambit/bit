import { merge } from 'lodash';
import { TestCmd } from './test.cmd';
import { Environments } from '../environments';
import { WorkspaceExt, Workspace } from '../workspace';
import { TesterService } from './tester.service';
import { Component } from '../component';
import { TesterTask } from './tester.task';
import { CLIExtension } from '../cli';

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

export class TesterExtension {
  static id = '@teambit/tester';
  static dependencies = [CLIExtension, Environments, WorkspaceExt];

  constructor(
    /**
     * envs extension.
     */
    private envs: Environments,

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

  static provider([cli, envs, workspace]: [CLIExtension, Environments, Workspace], config: TesterExtensionConfig) {
    // @todo: Ran to fix.
    // @ts-ignore
    const tester = new TesterExtension(
      envs,
      workspace,
      new TesterService(workspace, config.testRegex),
      new TesterTask(TesterExtension.id)
    );
    if (workspace && !workspace.consumer.isLegacy) {
      cli.unregister('test');
      cli.register(new TestCmd(tester, workspace));
    }

    return tester;
  }
}
