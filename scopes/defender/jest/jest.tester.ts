import { readFileSync } from 'fs-extra';
import minimatch from 'minimatch';
import { compact, flatten } from 'lodash';
// import { runCLI } from 'jest';
import { proxy } from 'comlink';
import { Logger } from '@teambit/logger';
import { HarmonyWorker } from '@teambit/worker';
import { Tester, CallbackFn, TesterContext, Tests, ComponentPatternsMap } from '@teambit/tester';
import { TestsFiles, TestResult, TestsResult } from '@teambit/tests-results';
import { TestResult as JestTestResult, AggregatedResult } from '@jest/test-result';
import { formatResultsErrors } from 'jest-message-util';
import { ComponentMap, ComponentID } from '@teambit/component';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { JestError } from './error';
import type { JestWorker } from './jest.worker';

const jest = require('jest');

export class JestTester implements Tester {
  constructor(
    readonly id: string,
    readonly jestConfig: any,
    private jestModule: typeof jest,
    private jestWorker: HarmonyWorker<JestWorker>,
    private logger: Logger
  ) {}

  configPath = this.jestConfig;

  displayName = 'Jest';

  _callback: CallbackFn | undefined;

  displayConfig() {
    return readFileSync(this.jestConfig, 'utf8');
  }

  version() {
    return this.jestModule.getVersion();
  }

  // private getTestFile(path: string, testerContext: TesterContext): AbstractVinyl | undefined {
  //   return testerContext.specFiles.toArray().reduce((acc: AbstractVinyl | undefined, [, specs]) => {
  //     const file = specs.find((spec) => spec.path === path);
  //     if (file) acc = file;
  //     return acc;
  //   }, undefined);
  // }

  private attachTestsToComponent(testerContext: TesterContext, testResult: JestTestResult[]) {
    return ComponentMap.as(testerContext.components, (component) => {
      const componentSpecFiles = testerContext.patterns.get(component);
      if (!componentSpecFiles) return undefined;
      const [, specs] = componentSpecFiles;
      return testResult.filter((test) => {
        return specs.filter((pattern) => minimatch(test.testFilePath, pattern.path)).length > 0;
      });
    });
  }

  private buildTestsObj(
    aggregatedResult: AggregatedResult,
    components: ComponentMap<JestTestResult[] | undefined>,
    testerContext: TesterContext,
    config?: any
  ) {
    const testsSuiteResult = components.toArray().map(([component, testsFiles]) => {
      if (!testsFiles) return;
      if (testsFiles?.length === 0) return;
      const tests = testsFiles.map((test) => {
        const file = new AbstractVinyl({ path: test.testFilePath, contents: readFileSync(test.testFilePath) });
        const testResults = test.testResults.map((testResult) => {
          const error = formatResultsErrors([testResult], config, { noStackTrace: true });
          return new TestResult(
            testResult.ancestorTitles,
            testResult.title,
            testResult.status,
            testResult.duration,
            error || undefined
          );
        });
        const filePath = file?.basename || test.testFilePath;
        const error = {
          failureMessage: test.testExecError ? test.failureMessage : undefined,
          error: test.testExecError?.message,
        };
        return new TestsFiles(
          filePath,
          testResults,
          test.numPassingTests,
          test.numFailingTests,
          test.numPendingTests,
          test.perfStats.runtime,
          test.perfStats.slow,
          error
        );
      });
      // TODO @guy - fix this eslint error
      // eslint-disable-next-line
      return {
        componentId: component.id,
        results: new TestsResult(tests, aggregatedResult.success, aggregatedResult.startTime),
      };
    });

    return compact(testsSuiteResult) as { componentId: ComponentID; results: TestsResult }[];
  }

  private getErrors(testResult: JestTestResult[]): JestError[] {
    return testResult.reduce((errors: JestError[], test) => {
      if (test.testExecError) {
        const { message, stack, code, type } = test.testExecError;
        errors.push(new JestError(message, stack, code, type));
      }
      if (test.failureMessage) {
        errors.push(new JestError(test.failureMessage));
      }
      return errors;
    }, []);
  }

  async onTestRunComplete(callback: CallbackFn) {
    this._callback = callback;
  }

  async test(context: TesterContext): Promise<Tests> {
    const config: any = {
      rootDir: context.rootPath,
    };

    // eslint-disable-next-line no-console
    console.warn = (message: string) => {
      this.logger.warn(message);
    };

    if (context.debug) config.runInBand = true;
    config.runInBand = true;
    if (context.watch) {
      config.watchAll = true;
      config.noCache = true;
    }
    // eslint-disable-next-line
    const jestConfig = require(this.jestConfig);

    const jestConfigWithSpecs = Object.assign(jestConfig, {
      testMatch: this.patternsToArray(context.patterns),
    });

    const withEnv = Object.assign(jestConfigWithSpecs, config);
    const testsOutPut = await this.jestModule.runCLI(withEnv, [this.jestConfig]);
    const testResults = testsOutPut.results.testResults;
    const componentsWithTests = this.attachTestsToComponent(context, testResults);
    const componentTestResults = this.buildTestsObj(
      testsOutPut.results,
      componentsWithTests,
      context,
      jestConfigWithSpecs
    );
    const globalErrors = this.getErrors(testResults);
    return { components: componentTestResults, errors: globalErrors };
  }

  async watch(context: TesterContext): Promise<Tests> {
    // eslint-disable-next-line
    return new Promise(async (resolve) => {
      const workerApi = this.jestWorker.initiate(
        context.ui ? { stdout: true, stderr: true, stdin: true } : { stdout: false, stderr: false, stdin: false }
      );

      // eslint-disable-next-line
      const jestConfig = require(this.jestConfig);

      const jestConfigWithSpecs = Object.assign(jestConfig, {
        testMatch: this.patternsToArray(context.patterns),
      });

      try {
        const cbFn = proxy((results) => {
          if (!this._callback) return;
          const testResults = results.testResults;
          const componentsWithTests = this.attachTestsToComponent(context, testResults);
          const componentTestResults = this.buildTestsObj(results, componentsWithTests, context, jestConfigWithSpecs);
          const globalErrors = this.getErrors(testResults);
          const watchTestResults = {
            loading: false,
            errors: globalErrors,
            components: componentTestResults,
          };
          this._callback(watchTestResults);
          resolve(watchTestResults);
        });

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        await workerApi.onTestComplete(cbFn);

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        await workerApi.watch(this.jestConfig, this.patternsToArray(context.patterns), context.rootPath);
      } catch (err) {
        this.logger.error('jest.tester.watch() caught an error', err);
      }
    });
  }

  private patternsToArray(patterns: ComponentPatternsMap) {
    return flatten(patterns.toArray().map(([, pattern]) => pattern.map((p) => p.path)));
  }
}
