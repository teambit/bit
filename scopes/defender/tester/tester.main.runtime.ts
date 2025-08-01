import fs from 'fs-extra';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import type { Component, IComponent } from '@teambit/component';
import compact from 'lodash.compact';
import type { EnvsExecutionResult, EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import type { LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import type { BuilderMain } from '@teambit/builder';
import { BuilderAspect } from '@teambit/builder';
import type { UiMain } from '@teambit/ui';
import { UIAspect } from '@teambit/ui';
import { merge } from 'lodash';
import type { DevFilesMain } from '@teambit/dev-files';
import { DevFilesAspect } from '@teambit/dev-files';
import type { TestsResult } from '@teambit/tests-results';
import type { ComponentsResults, CallbackFn, Tests } from './tester';
import { TestCmd } from './test.cmd';
import { TesterAspect } from './tester.aspect';
import { TesterService } from './tester.service';
import { TesterTask } from './tester.task';
import { detectTestFiles } from './utils';
import { testerSchema } from './tester.graphql';
import { testsResultsToJUnitFormat } from './utils/junit-generator';

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

export type TestResults = EnvsExecutionResult<Tests>;

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

  /**
   * show code coverage
   */
  coverage?: boolean;

  /**
   * update snapshot if supported by the tester
   */
  updateSnapshot?: boolean;

  callback?: CallbackFn;
};

type CoverageResults = {
  files: CoverageFile[];
  total: CoverageData;
};

type CoverageStats = {
  pct: number;
  total: number;
  covered: number;
  skipped: number;
};

type CoverageFile = {
  path: string;
  data: CoverageData;
};

type CoverageData = {
  lines: CoverageStats;
  statements: CoverageStats;
  functions: CoverageStats;
  branches: CoverageStats;
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
    private patterns: string[],
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

  async test(components: Component[], opts?: TesterOptions): Promise<TestResults> {
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

  private async generateJUnit(filePath: string, testsResults: TestResults) {
    const components = testsResults.results.map((envResult) => envResult.data?.components).flat();
    const jUnit = testsResultsToJUnitFormat(compact(components));
    await fs.outputFile(filePath, jUnit);
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

  async getTestsResults(
    component: IComponent,
    idHasVersion = true
  ): Promise<{ testsResults?: TestsResult; loading: boolean; coverage?: CoverageResults } | undefined> {
    const entry = component.get(TesterAspect.id);
    const isModified = !idHasVersion && (await component.isModified());
    const data = this.builder.getDataByAspect(component, TesterAspect.id) as {
      tests: TestsResult & {
        coverage: CoverageResults;
      };
    };
    if ((entry || data) && !isModified) {
      return { testsResults: data?.tests || entry?.data.tests, loading: false, coverage: data?.tests.coverage };
    }
    return this.getTestsResultsFromState(component);
  }

  private getTestsResultsFromState(component: IComponent) {
    const tests = this._testsResults[component.id.toString()];
    return { testsResults: tests?.results, loading: tests?.loading || false, coverage: tests?.coverage };
  }

  /**
   * Get the tests patterns from the config. (used as default patterns in case the env does not provide them via getTestsDevPatterns)
   * @returns
   */
  getPatterns() {
    return this.patterns;
  }

  getComponentDevPatterns(component: Component) {
    const env = this.envs.calculateEnv(component, { skipWarnings: !!this.workspace?.inInstallContext }).env;
    const componentPatterns: string[] = env.getTestsDevPatterns
      ? env.getTestsDevPatterns(component)
      : this.getPatterns();
    return { name: 'tests', pattern: componentPatterns };
  }

  getDevPatternToRegister() {
    return this.getComponentDevPatterns.bind(this);
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
    watchOnStart: false,
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
      BuilderMain,
    ],
    config: TesterExtensionConfig
  ) {
    const logger = loggerAspect.createLogger(TesterAspect.id);
    const testerService = new TesterService(workspace, logger, graphql.pubsub, devFiles);
    envs.registerService(testerService);
    const tester = new TesterMain(
      config.patterns,
      graphql,
      envs,
      workspace,
      testerService,
      new TesterTask(TesterAspect.id, devFiles),
      devFiles,
      builder
    );
    devFiles.registerDevPattern(tester.getDevPatternToRegister());

    if (workspace) {
      ui.registerOnStart(async () => {
        if (!config.watchOnStart) return undefined;
        await tester.uiWatch();
        return undefined;
      });
    }
    cli.register(new TestCmd(tester, workspace, logger));

    graphql.register(() => testerSchema(tester, graphql));

    return tester;
  }
}

TesterAspect.addRuntime(TesterMain);
