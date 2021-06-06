import { Prompt, WatchPlugin, JestHookSubscriber, UsageData } from 'jest-watcher';
import { SpecFiles } from '@teambit/tester';

export type PluginConfig = {
  onComplete: (testSuite: any) => void;
  shouldRunTestSuite: (specFile: any) => Promise<boolean>;
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

  _shouldRunTestSuite: (specFile: any) => Promise<boolean>;

  _runRunCache: string;

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
    this._prompt = new Prompt();
    this._runRunCache;
    this._specFiles = config.specFiles;
    this._onComplete = config.onComplete;
    this._shouldRunTestSuite = config.shouldRunTestSuite;
  }

  apply(jestHooks: JestHookSubscriber) {
    jestHooks.shouldRunTestSuite(async (testSuite) => {
      const shouldRun = await this._shouldRunTestSuite(testSuite.testPath);
      if (shouldRun) return true;
      return false;
    });

    jestHooks.onTestRunComplete((results) => {
      this._onComplete(results);
    });
  }
}

module.exports = Watch;
