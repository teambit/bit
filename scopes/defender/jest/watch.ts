import { Prompt, WatchPlugin, JestHookSubscriber, UsageData } from 'jest-watcher';
import { SpecFiles } from '@teambit/tester';

export type PluginConfig = {
  onComplete: (testSuite: any) => void;
  specFiles: SpecFiles;
};

class Watch implements WatchPlugin {
  _stdin: NodeJS.ReadStream;

  _stdout: NodeJS.WriteStream;

  _prompt: Prompt;

  _testResults: any;

  _usageInfo: UsageData;

  _specFiles: SpecFiles;

  _onComplete: (testSuite: any) => void;

  constructor({
    stdin,
    stdout,
    config,
  }: {
    stdin: NodeJS.ReadStream;
    stdout: NodeJS.WriteStream;
    config: PluginConfig;
  }) {
    this._stdin = stdin;
    this._stdout = stdout;
    this._specFiles = config.specFiles;
    this._onComplete = config.onComplete;
  }

  private findComponent(specFile: string) {
    const component = this._specFiles.toArray().find(([, specs]) => {
      const paths = specs.map((spec) => spec.path);
      if (paths.includes(specFile)) return true;
      return false;
    });
    return component?.[0];
  }

  apply(jestHooks: JestHookSubscriber) {
    // jestHooks.shouldRunTestSuite(async (testSuite) => {
    //   const component = this.findComponent(testSuite.testPath);
    //   if ((await component?.isModified()) || (await component?.isNew())) return true;
    //   return false;
    // });

    jestHooks.onTestRunComplete((results) => {
      this._onComplete(results);
    });
  }
}

module.exports = Watch;
