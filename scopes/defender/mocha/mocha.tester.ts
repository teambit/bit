import { Logger } from '@teambit/logger';
import { ComponentsResults, Tester, CallbackFn, TesterContext, Tests } from '@teambit/tester';
import Mocha, { Test } from 'mocha';
import babelRegister from '@babel/register';
import type { TransformOptions } from '@babel/core';
import { TestResult, TestsFiles, TestsResult } from '@teambit/tests-results';
import pMapSeries from 'p-map-series';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { compact } from 'lodash';

export class MochaTester implements Tester {
  _callback: CallbackFn | undefined;
  displayName = 'Mocha';
  constructor(
    readonly id: string,
    private logger: Logger,
    readonly mochaConfig: Mocha.MochaOptions,
    /**
     * babel config are needed when the spec files are not native javascript and need to be compiled.
     * pass the same config you pass to your babel compiler if you're using one.
     */
    private babelConfig: TransformOptions,
    private MochaModule: typeof Mocha
  ) {}
  async test(context: TesterContext): Promise<Tests> {
    if (context.ui) {
      // @todo: maybe support UI tests at some point
      return new Tests([]);
    }
    this.logger.clearStatusLine();
    const specsPerComp = context.specFiles.toArray();
    babelRegister({
      extensions: ['.es6', '.es', '.jsx', '.js', '.mjs', '.ts', '.tsx'],
      ...(this.babelConfig || {}),
    });
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
        errors: compact(allComponentErrors),
      };
    });
    return new Tests(componentsResults);
  }

  /**
   * @todo: make this work. currently, it doesn't update the UI upon changes.
   */
  // async watch(context: TesterContext): Promise<Tests> {
  //   const results = await this.test(context);
  //   if (this._callback) {
  //     this._callback(results);
  //   }
  //   return results;
  // }

  async onTestRunComplete(callback: CallbackFn) {
    this._callback = callback;
  }

  private async runMochaOnOneFile(file: AbstractVinyl): Promise<TestsFiles> {
    const mocha = new this.MochaModule(this.mochaConfig);
    mocha.addFile(file.path);
    const testResults: TestResult[] = [];
    const handleTest = (test: Test) => {
      const state = test.state;
      if (!state) {
        throw new Error(`the test.state of "${test.title}", file "${file.path}" is neither passed nor failed`);
      }
      testResults.push(new TestResult(test.titlePath(), test.title, state, test.duration, undefined, test.err));
    };
    return new Promise((resolve) => {
      const runner = mocha
        .run()
        .on('test end', (test) => handleTest(test))
        .on('fail', (test) => {
          if (test.type !== 'test') {
            // otherwise, it was handled already in "test end" event.
            // this is mainly for test.type of "hook", e.g. "before", "after", "beforeAll", "afterAll"
            handleTest(test);
          }
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
