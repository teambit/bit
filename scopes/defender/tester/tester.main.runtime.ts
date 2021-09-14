import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Component } from '@teambit/component';
import { EnvsAspect, EnvsExecutionResult, EnvsMain } from '@teambit/envs';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import stripAnsi from 'strip-ansi';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { UiMain, UIAspect } from '@teambit/ui';
import { merge } from 'lodash';
import DevFilesAspect, { DevFilesMain } from '@teambit/dev-files';
import { TestsResult } from '@teambit/tests-results';
import junitReportBuilder from 'junit-report-builder';
import { ComponentsResults, CallbackFn, Tests } from './tester';
import { TestCmd } from './test.cmd';
import { TesterAspect } from './tester.aspect';
import { TesterService } from './tester.service';
import { TesterTask } from './tester.task';
import { detectTestFiles } from './utils';
import { testerSchema } from './tester.graphql';

export type TesterExtensionConfig = {
  /**
   * regex of the text environment.
   */
  testRegex: string;

  /**
   * determine whether to watch on start.
   */
  watchOnStart: boolean;
  patterns: string[];
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

  /**
   * start the tester in debug mode.
   */
  ui?: boolean;

  /**
   * initiate the tester on given env.
   */
  env?: string;

  /**
   * generate JUnit files on the specified dir
   */
  junit?: string;

  callback?: CallbackFn;
};

export class TesterMain {
  static runtime = MainRuntime;
  static dependencies = [
    CLIAspect,
    EnvsAspect,
    WorkspaceAspect,
    LoggerAspect,
    GraphqlAspect,
    UIAspect,
    DevFilesAspect,
    BuilderAspect,
  ];

  constructor(
    /**
     * graphql extension.
     */
    private graphql: GraphqlMain,

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
    readonly task: TesterTask,

    private devFiles: DevFilesMain,

    private builder: BuilderMain
  ) {}

  _testsResults: { [componentId: string]: ComponentsResults } | undefined[] = [];

  async test(components: Component[], opts?: TesterOptions): Promise<EnvsExecutionResult<Tests>> {
    const options = this.getOptions(opts);
    const envsRuntime = await this.envs.createEnvironment(components);
    if (opts?.env) {
      return envsRuntime.runEnv(opts.env, this.service, options);
    }
    const results = await envsRuntime.run(this.service, options);
    if (opts?.junit) {
      await this.generateJUnit(opts?.junit, results);
    }
    return results;
  }

  private async generateJUnit(outDir: string, testsResults: EnvsExecutionResult<Tests>) {
    testsResults.results.forEach((envResult) => {
      envResult.data?.components.forEach((compResult) => {
        const suite = junitReportBuilder.testSuite().name(compResult.componentId.toString());
        compResult.results?.testFiles.forEach((testFile) => {
          testFile.tests.forEach((test) => {
            const testCase = suite.testCase().className(testFile.file).name(test.name);
            if (test.error) {
              testCase.error(stripAnsi(test.error));
            }
            if (test.failure) {
              testCase.failure(stripAnsi(test.failure));
            }
            if (test.status === 'skipped' || test.status === 'pending') {
              testCase.skipped();
            }
            if (test.duration) {
              testCase.time(test.duration / 1000);
            }
          });
        });
      });
    });
    junitReportBuilder.writeTo(`${outDir}/junit.xml`);
  }

  /**
   * watch all components for changes and test upon each.
   */
  async watch(components: Component[], opts?: TesterOptions) {
    const options = this.getOptions(opts);
    const envsRuntime = await this.envs.createEnvironment(components);
    if (opts?.env) {
      return envsRuntime.runEnv(opts.env, this.service, options);
    }

    this.service.onTestRunComplete((results) => {
      results.components.forEach((component) => {
        this._testsResults[component.componentId.toString()] = component;
      });
    });
    return envsRuntime.run(this.service, options);
  }

  async uiWatch() {
    const components = await this.workspace.list();
    return this.watch(components, { watch: true, debug: false, ui: true });
  }

  async getTestsResults(component: Component): Promise<{ testsResults?: TestsResult; loading: boolean } | undefined> {
    const entry = component.state.aspects.get(TesterAspect.id);
    const componentStatus = await this.workspace?.getComponentStatus(component);
    const data = this.builder.getDataByAspect(component, TesterAspect.id) as { tests: TestsResult };
    if ((entry || data) && !componentStatus?.modifyInfo?.hasModifiedFiles) {
      return { testsResults: data?.tests || entry?.data.tests, loading: false };
    }
    return this.getTestsResultsFromState(component);
  }

  private getTestsResultsFromState(component: Component) {
    const tests = this._testsResults[component.id.toString()];
    return { testsResults: tests?.results, loading: tests?.loading || false };
  }

  /**
   * get all test files of a component.
   */
  getTestFiles(component: Component) {
    return detectTestFiles(component, this.devFiles);
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
    patterns: ['**/*.spec.+(js|ts|jsx|tsx)', '**/*.test.+(js|ts|jsx|tsx)'],

    /**
     * determine whether to watch on start.
     */
    watchOnStart: true,
  };

  static async provider(
    [cli, envs, workspace, loggerAspect, graphql, ui, devFiles, builder]: [
      CLIMain,
      EnvsMain,
      Workspace,
      LoggerMain,
      GraphqlMain,
      UiMain,
      DevFilesMain,
      BuilderMain
    ],
    config: TesterExtensionConfig
  ) {
    const logger = loggerAspect.createLogger(TesterAspect.id);
    const testerService = new TesterService(workspace, config.patterns, logger, graphql.pubsub, devFiles);
    envs.registerService(testerService);
    devFiles.registerDevPattern(config.patterns);
    const tester = new TesterMain(
      graphql,
      envs,
      workspace,
      testerService,
      new TesterTask(TesterAspect.id, devFiles),
      devFiles,
      builder
    );

    if (workspace && !workspace.consumer.isLegacy) {
      cli.unregister('test');
      ui.registerOnStart(async () => {
        if (!config.watchOnStart) return undefined;
        await tester.uiWatch();
        return undefined;
      });

      cli.register(new TestCmd(tester, workspace, logger));
    }

    graphql.register(testerSchema(tester, graphql));

    return tester;
  }
}

TesterAspect.addRuntime(TesterMain);
