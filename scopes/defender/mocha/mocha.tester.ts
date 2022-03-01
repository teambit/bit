import { Logger } from '@teambit/logger';
import { ComponentsResults, Tester, CallbackFn, TesterContext, Tests } from '@teambit/tester';
import Mocha from 'mocha';
import babelRegister from '@babel/register';
import { TestResult, TestsFiles, TestsResult } from '@teambit/tests-results';
import pMapSeries from 'p-map-series';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';

export class MochaTester implements Tester {
  _callback: CallbackFn | undefined;
  displayName = 'Mocha';
  constructor(
    readonly id: string,
    private logger: Logger,
    readonly mochaConfig: any,
    private babelConfig: any,
    private MochaModule: typeof Mocha
  ) {}
  async test(context: TesterContext): Promise<Tests> {
    // todo: remove this "extensions" property and use "only" with a function that returns true
    // for the specs files paths only. see syntax here: https://babeljs.io/docs/en/babel-register
    babelRegister({ extensions: ['.js', '.jsx', '.ts', '.tsx'], ...(this.babelConfig || {}) });
    const specsPerComp = context.specFiles.toArray();
    const componentsResults: ComponentsResults[] = await pMapSeries(specsPerComp, async ([component, files]) => {
      const testsFiles: TestsFiles[] = await pMapSeries(files, async (file) => {
        try {
          return await this.runMochaOnOneFile(file);
        } catch (err: any) {
          const errMsg = `Mocha found an error while working on "${file.path}". ${err.message}`;
          this.logger.error(errMsg, err);
          this.logger.consoleFailure(errMsg);
          return new TestsFiles(file.relative, [], 0, 0, 0, undefined, undefined, err);
        }
      });
      const allComponentErrors = testsFiles
        .map((testFile) => testFile.error || testFile.tests.map((test) => test.failureErrOrStr as Error))
        .flat();
      return {
        componentId: component.id,
        results: new TestsResult(testsFiles),
        errors: allComponentErrors,
      };
    });
    return new Tests(componentsResults);
  }

  async watch(context: TesterContext): Promise<Tests> {
    const results = await this.test(context);
    if (this._callback) {
      this._callback(results);
    }
    return results;
  }

  async onTestRunComplete(callback: CallbackFn) {
    this._callback = callback;
  }

  private async runMochaOnOneFile(file: AbstractVinyl): Promise<TestsFiles> {
    const mocha = new this.MochaModule(this.mochaConfig);
    mocha.addFile(file.path);
    const testResults: TestResult[] = [];
    return new Promise((resolve) => {
      const runner = mocha
        .run()
        .on('test end', function (test) {
          const state = test.state;
          if (!state)
            throw new Error(`the test.state of "${test.title}", file "${file.path}" is neither passed nor failed`);
          testResults.push(new TestResult(test.titlePath(), test.title, state, test.duration, undefined, test.err));
        })
        .on('end', function () {
          const stats = runner.stats;
          if (!stats) throw new Error('stats is missing');
          const testsFile = new TestsFiles(
            file.relative,
            testResults,
            stats.passes,
            stats.failures,
            stats.pending,
            stats.duration
          );
          resolve(testsFile);
        });
    });
  }

  version(): string {
    // @ts-ignore
    return Mocha.prototype.version || 'N/A';
  }
}
