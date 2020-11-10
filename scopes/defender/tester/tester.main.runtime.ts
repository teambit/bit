import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Component } from '@teambit/component';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import DevFilesAspect, { DevFilesMain } from '@teambit/dev-files';
import { merge } from 'lodash';
import { TestsResult } from './tests-results';
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
   * initiate the tester on given env.
   */
  env?: string;
};

export class TesterMain {
  static runtime = MainRuntime;
  static dependencies = [CLIAspect, EnvsAspect, WorkspaceAspect, LoggerAspect, GraphqlAspect, DevFilesAspect];

  constructor(
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

    private devFiles: DevFilesMain
  ) {}

  async test(components: Component[], opts?: TesterOptions) {
    const options = this.getOptions(opts);
    const envsRuntime = await this.envs.createEnvironment(components);
    if (opts?.env) {
      return envsRuntime.runEnv(opts.env, this.service, options);
    }
    const results = await envsRuntime.run(this.service, options);
    return results;
  }

  /**
   * watch all components for changes and test upon each.
   */
  watch() {}

  getTestsResults(component: Component): TestsResult | undefined {
    const entry = component.state.aspects.get(TesterAspect.id);
    // TODO: type is ok, talk to @david about it
    // @ts-ignore
    return entry?.data.tests;
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
    patterns: ['*.spec.*', '*.test.*'],
  };

  static async provider(
    [cli, envs, workspace, loggerAspect, graphql, devFiles]: [
      CLIMain,
      EnvsMain,
      Workspace,
      LoggerMain,
      GraphqlMain,
      DevFilesMain
    ],
    config: TesterExtensionConfig
  ) {
    const logger = loggerAspect.createLogger(TesterAspect.id);
    const testerService = new TesterService(workspace, config.patterns, logger, devFiles);
    envs.registerService(testerService);
    devFiles.registerDevPattern(config.patterns);
    const tester = new TesterMain(envs, workspace, testerService, new TesterTask(TesterAspect.id), devFiles);

    if (workspace && !workspace.consumer.isLegacy) {
      cli.unregister('test');
      cli.register(new TestCmd(tester, workspace, logger));
    }
    graphql.register(testerSchema(tester));

    return tester;
  }
}

TesterAspect.addRuntime(TesterMain);
