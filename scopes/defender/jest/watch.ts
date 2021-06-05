import fs from 'fs';
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
    jestHooks.onFileChange(({ projects }) => {
      projects.map((project) => {
        const lastFile = project.testPaths.slice(-1).pop();
        let changedModifiedTime = new Date();
        let changedAccessTime = new Date();
        if (!lastFile) return;
        if (this._runRunCache != lastFile) fs.utimesSync(lastFile, changedAccessTime, changedModifiedTime);
        this._runRunCache = lastFile;
      });
      //const lastFile = projects.slice(-1).pop()
    });

    jestHooks.shouldRunTestSuite(async (testSuite) => {
      const shouldRun = await this._shouldRunTestSuite(testSuite.testPath);
      if (shouldRun) return true;
      return false;
    });

    jestHooks.onTestRunComplete((results) => {
      this._onComplete(results);
    });
  }

  async run(globalConfig: any, updateConfigAndRun: any): Promise<void> {
    debugger;
    console.log(globalConfig);
    console.log(updateConfigAndRun);
    return;
  }
}

module.exports = Watch;
