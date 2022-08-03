import { readFileSync } from 'fs-extra';
import minimatch from 'minimatch';
import { compact, flatten } from 'lodash';
import { proxy } from 'comlink';
import { Logger } from '@teambit/logger';
import { HarmonyWorker } from '@teambit/worker';
import { Tester, CallbackFn, TesterContext, Tests, ComponentPatternsMap, ComponentsResults } from '@teambit/tester';
import { TestsFiles, TestResult, TestsResult } from '@teambit/tests-results';
import { TestResult as JestTestResult, AggregatedResult } from '@jest/test-result';
import { formatResultsErrors } from 'jest-message-util';
import { ComponentMap } from '@teambit/component';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { Environment } from '@teambit/envs';
import { EnvPolicyConfigObject, PeersAutoDetectPolicy } from '@teambit/dependency-resolver';
import type jest from 'jest';
import { JestError } from './error';
import type { JestWorker } from './jest.worker';

export class JestTester implements Tester {
  private readonly jestModule: typeof jest;

  constructor(
    readonly id: string,
    readonly jestConfig: any,
    private jestModulePath: string,
    private jestWorker: HarmonyWorker<JestWorker>,
    private logger: Logger
  ) {
    // eslint-disable-next-line global-require,import/no-dynamic-require
    this.jestModule = require(jestModulePath);
  }

  configPath = this.jestConfig;

  displayName = 'Jest';

  _callback: CallbackFn | undefined;

  displayConfig() {
    return readFileSync(this.jestConfig, 'utf8');
  }

  version() {
    return this.jestModule.getVersion();
  }

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
  ): ComponentsResults[] {
    const testsSuiteResult = components.toArray().map(([component, testsFiles]) => {
      if (!testsFiles) return undefined;
      if (testsFiles?.length === 0) return undefined;
      const errors = this.getErrors(testsFiles);
      const tests = testsFiles.map((test) => {
        const file = new AbstractVinyl({ path: test.testFilePath, contents: readFileSync(test.testFilePath) });
        const testResults = test.testResults.map((testResult) => {
          const error = formatResultsErrors([testResult], config, { noStackTrace: true }) || undefined;
          const isFailure = testResult.status === 'failed';
          return new TestResult(
            testResult.ancestorTitles,
            testResult.title,
            testResult.status,
            testResult.duration,
            isFailure ? undefined : error,
            isFailure ? error : undefined
          );
        });
        const filePath = file?.basename || test.testFilePath;
        const getError = () => {
          if (!test.testExecError) return undefined;
          if (testerContext.watch) {
            // for some reason, during watch ('bit start'), if a file has an error, the `test.testExecError` is `{}`
            // (an empty object). the failureMessage contains the stringified error.
            // @todo: consider to always use the failureMessage, regardless the context.watch.
            return new JestError(test.failureMessage as string);
          }
          return new JestError(test.testExecError?.message, test.testExecError?.stack);
        };
        const error = getError();
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
      return {
        componentId: component.id,
        results: new TestsResult(tests, aggregatedResult.success, aggregatedResult.startTime),
        errors,
      };
    });

    return compact(testsSuiteResult);
  }

  private getErrors(testResult: JestTestResult[]): JestError[] {
    return testResult.reduce((errors: JestError[], test) => {
      if (test.testExecError) {
        const { message, stack, code, type } = test.testExecError;
        errors.push(new JestError(message, stack, code, type));
      } else if (test.failureMessage) {
        errors.push(new JestError(test.failureMessage));
      }
      return errors;
    }, []);
  }

  async onTestRunComplete(callback: CallbackFn) {
    this._callback = callback;
  }

  async test(context: TesterContext): Promise<Tests> {
    const envRootDir = context.envRuntime.envAspectDefinition.aspectPath;

    const config: any = {
      // Setting the rootDir to the env root dir to make sure we can resolve all the jest presets/plugins
      // from the env context
      rootDir: envRootDir,
      // Setting the roots (where to search for spec files) to the root path (either workspace or capsule root)
      // TODO: consider change this to be an array of the components running dir.
      // TODO: aka: in the workspace it will be something like <ws>/node_modules/<comp-package-name>/node_modules/<comp-package-name>
      // TODO: see dependencyResolver.getRuntimeModulePath (this will make sure the peer deps resolved correctly)
      // TODO: (@GiladShoham - when trying to set it to this paths, jest ignores it probably because the paths contains "node_modules"
      // TODO: trying to set the https://jestjs.io/docs/27.x/configuration#testpathignorepatterns-arraystring to something else (as it contain node_modules by default)
      // TODO: didn't help)
      roots: [context.rootPath],
    };

    // eslint-disable-next-line no-console
    console.warn = (message: string) => {
      this.logger.warn(message);
    };

    if (context.debug) {
      config.debug = true;
      config.runInBand = true;
    }
    if (context.coverage) config.coverage = true;
    config.runInBand = true;

    if (context.watch) {
      config.watchAll = true;
      config.noCache = true;
    }
    // eslint-disable-next-line global-require,import/no-dynamic-require
    const jestConfig = require(this.jestConfig);

    const moduleNameMapper = await this.calculateModuleNameMapper(
      context.env,
      context.rootPath,
      context.additionalHostDependencies
    );
    jestConfig.moduleNameMapper = Object.assign({}, jestConfig.moduleNameMapper || {}, moduleNameMapper);

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
    return new Tests(componentTestResults);
  }

  async watch(context: TesterContext): Promise<Tests> {
    // eslint-disable-next-line
    return new Promise(async (resolve) => {
      const workerApi = this.jestWorker.initiate(
        context.ui ? { stdout: true, stderr: true, stdin: true } : { stdout: false, stderr: false, stdin: false }
      );

      // eslint-disable-next-line
      const jestConfig = require(this.jestConfig);

      const envRootDir = context.envRuntime.envAspectDefinition.aspectPath;

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

        await workerApi.watch(
          this.jestConfig,
          this.patternsToArray(context.patterns),
          context.rootPath,
          this.jestModulePath,
          envRootDir
        );
      } catch (err: any) {
        this.logger.error('jest.tester.watch() caught an error', err);
      }
    });
  }

  private async calculateModuleNameMapper(
    env: Environment,
    rootPath: string,
    additionalHostDependencies?: string[]
  ): Promise<Record<string, Array<string>>> {
    const peerDepsConfig: EnvPolicyConfigObject = await env.getDependencies();
    const peersAutoDetectPolicy = new PeersAutoDetectPolicy(peerDepsConfig.peers || []);
    const peers = Object.keys(peerDepsConfig.peerDependencies || {}).concat(peersAutoDetectPolicy?.names);
    const depsToMap = peers.concat(additionalHostDependencies || []);

    /**
     * Try to resolve the dependency from the rootDir (the env dir) or from the root path (workspace/capsule root)
     */
    const mappedValues = ['<rootDir>/node_modules/$1', `${rootPath}/node_modules/$1`];

    const moduleNameMapper = depsToMap.reduce((acc, peerName) => {
      const keyName = `^(${peerName})$`;
      acc[keyName] = mappedValues;
      const internalPathKeyName = `^(${peerName}/.*)$`;
      acc[internalPathKeyName] = mappedValues;
      return acc;
    }, {});

    return moduleNameMapper;
  }

  private patternsToArray(patterns: ComponentPatternsMap) {
    return flatten(patterns.toArray().map(([, pattern]) => pattern.map((p) => p.path)));
  }
}
