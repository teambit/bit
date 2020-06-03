import { BitCli as CLI, BitCliExt as CLIExtension } from '../cli';
import { TestCmd } from './test.cmd';
import { Environments } from '../environments';
import { WorkspaceExt, Workspace } from '../workspace';
import { TesterService } from './tester.service';
import { Component } from '../component';

export type TesterExtensionConfig = {
  /**
   * regex of the text environment.
   */
  testRegex: string;
};

export class TesterExtension {
  static dependencies = [CLIExtension, Environments, WorkspaceExt];

  constructor(private envs: Environments, private workspace: Workspace, private testerService: TesterService) {}

  async test(components?: Component[]) {
    const envs = await this.envs.createEnvironment(components);
    const results = await Promise.all(
      envs.runtimeEnvs.map(runtimeEnv => {
        const tester = runtimeEnv.env.getTester();
        return tester.test({
          components: runtimeEnv.components,
          workspace: this.workspace
        });
      })
    );
    return results;
  }

  static defaultConfig = {
    /**
     * default test regex for which files tester to apply on.
     */
    testRegex: '*.{spec,test}.{js,jsx,ts,tsx}'
  };

  static provider([cli, envs, workspace]: [CLI, Environments, Workspace]) {
    const tester = new TesterExtension(envs, workspace, new TesterService());
    cli.register(new TestCmd(tester, workspace));

    return tester;
  }
}
