import { Command, CommandOptions, GenericObject } from '@teambit/cli';
import chalk from 'chalk';
import { Logger } from '@teambit/logger';
import { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { Timer } from '@teambit/toolbox.time.timer';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { TesterMain, TestResults } from './tester.main.runtime';

type TestFlags = {
  watch: boolean;
  debug: boolean;
  all: boolean;
  unmodified: boolean;
  env?: string;
  scope?: string;
  junit?: string;
  coverage?: boolean;
  updateSnapshot: boolean;
};

export class TestCmd implements Command {
  name = 'test [component-pattern]';
  description = 'test components in the workspace. by default only runs tests for new and modified components';
  helpUrl = 'reference/testing/tester-overview';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  alias = 'at';
  group = 'development';
  options = [
    ['w', 'watch', 'start the tester in watch mode.'],
    ['d', 'debug', 'start the tester in debug mode.'],
    ['a', 'all', 'DEPRECATED. (use --unmodified)'],
    ['u', 'unmodified', 'test all components, not only new and modified'],
    ['', 'junit <filepath>', 'write tests results as JUnit XML format into the specified file path'],
    ['', 'coverage', 'show code coverage data'],
    ['e', 'env <id>', 'test only components assigned the given env'],
    ['', 'update-snapshot', 'if supported by the tester, re-record every snapshot that fails during the test run'],
    [
      's',
      'scope <scope-name>',
      'DEPRECATED. (use the pattern instead, e.g. "scopeName/**"). name of the scope to test',
    ],
    ['j', 'json', 'return the results in json format'],
    // TODO: we need to reduce this redundant casting every time.
  ] as CommandOptions;

  constructor(
    private tester: TesterMain,
    private workspace: Workspace,
    private logger: Logger
  ) {}

  async report(
    [userPattern]: [string],
    {
      watch = false,
      debug = false,
      all = false,
      env,
      scope,
      junit,
      coverage = false,
      unmodified = false,
      updateSnapshot = false,
    }: TestFlags
  ) {
    const timer = Timer.create();
    const scopeName = typeof scope === 'string' ? scope : undefined;
    if (scopeName) {
      this.logger.consoleWarning(
        `--scope is deprecated, use the pattern argument instead. e.g. "scopeName/**" for the entire scope`
      );
    }
    if (all) {
      unmodified = all;
      this.logger.consoleWarning(`--all is deprecated, use --unmodified instead`);
    }
    timer.start();
    if (!this.workspace) throw new OutsideWorkspaceError();

    const getPatternWithScope = () => {
      if (!userPattern && !scope) return undefined;
      const pattern = userPattern || '**';
      return scopeName ? `${scopeName}/${pattern}` : pattern;
    };
    const patternWithScope = getPatternWithScope();
    const components = await this.workspace.getComponentsByUserInput(unmodified, patternWithScope, true);
    if (!components.length) {
      const data = chalk.bold(`no components found to test.
use "--unmodified" flag to test all components or specify the ids to test.
otherwise, only new and modified components will be tested`);
      return {
        code: 0,
        data,
      };
    }

    this.logger.console(
      `testing total of ${components.length} components in workspace '${chalk.cyan(this.workspace.name)}'`
    );

    let code = 0;
    if (watch && !debug) {
      // avoid turning off the logger for non-watch scenario. otherwise, when this aspect throws errors, they'll be
      // swallowed. (Jest errors are shown regardless via Jest, but if the tester is unable to run Jest in the first
      // place, these errors won't be shown)
      this.logger.off();
      await this.tester.watch(components, {
        watch,
        debug,
        env,
        coverage,
        updateSnapshot,
      });
    } else {
      const tests = await this.tester.test(components, {
        watch,
        debug,
        env,
        junit,
        coverage,
        updateSnapshot,
      });
      if (tests.hasErrors()) code = 1;
      if (process.exitCode && process.exitCode !== 0 && typeof process.exitCode === 'number') {
        // this is needed for testers such as "vitest", where it sets the exitCode to non zero when the coverage is not met.
        code = process.exitCode;
      }
    }
    const { seconds } = timer.stop();

    if (watch) return '';
    const data = `tests has been completed in ${chalk.cyan(seconds.toString())} seconds.`;
    return {
      code,
      data,
    };
  }

  async json( [userPattern]: [string],
    {
      watch = false,
      debug = false,
      env,
      junit,
      coverage = false,
      unmodified = false,
      updateSnapshot = false,
    }: TestFlags): Promise<GenericObject> {
      const timer = Timer.create();
      timer.start();
      if (!this.workspace) throw new OutsideWorkspaceError();

      const getPatternWithScope = () => {
        if (!userPattern) return undefined;
        const pattern = userPattern || '**';
        return pattern;
      };
      const patternWithScope = getPatternWithScope();
      const components = await this.workspace.getComponentsByUserInput(unmodified, patternWithScope, true);
      if (!components.length) {
        this.logger.info(`no components found to test.
  use "--unmodified" flag to test all components or specify the ids to test.
  otherwise, only new and modified components will be tested`);
        return {
          code: 0,
          data: [],
        };
      }

      let code = 0;
      const restore = silenceConsoleAndStdout();
      let tests: TestResults;
      try {
        tests = await this.tester.test(components, {
          watch,
          debug,
          env,
          junit,
          coverage,
          updateSnapshot,
        });
      } catch (err) {
        restore();
        throw err;
      }
      restore();
      if (tests.hasErrors()) code = 1;
      if (process.exitCode && process.exitCode !== 0 && typeof process.exitCode === 'number') {
        // this is needed for testers such as "vitest", where it sets the exitCode to non zero when the coverage is not met.
        code = process.exitCode;
      }

      const data = tests.results.map(r => ({
        data: {
          components: r.data?.components.map(c => ({
            ...c,
            componentId: c.componentId.toString(),
          })),
          errors: r.data?.errors,
        },
        error: r.error,
      }));

      return {
        code,
        data
      };
  }
}


/**
 * Disables all console logging (via console.*) and direct writes to
 * process.stdout / process.stderr. Returns a function that, when called,
 * restores everything back to normal.
 */
function silenceConsoleAndStdout(): () => void {
  // Keep copies of the original methods so we can restore them later
  const originalConsole = { ...console };
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;

  // No-op implementations for console.* methods
  for (const method of ["log", "warn", "error", "info", "debug"] as const) {
    // eslint-disable-next-line no-console
    console[method] = () => {};
  }

  // Replace process.stdout.write and process.stderr.write with no-ops
  process.stdout.write = (() => true) as any;
  process.stderr.write = (() => true) as any;

  // Return a function to restore original behavior
  return () => {
    for (const method of Object.keys(originalConsole) as (keyof Console)[]) {
      // @ts-ignore
      // eslint-disable-next-line no-console
      console[method] = originalConsole[method];
    }
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  };
}