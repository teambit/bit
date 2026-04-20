import type { Command, CommandOptions, GenericObject } from '@teambit/cli';
import { formatHint } from '@teambit/cli';
import chalk from 'chalk';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { OutsideWorkspaceError } from '@teambit/workspace';
import { Timer } from '@teambit/toolbox.time.timer';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { TesterMain, TestResults } from './tester.main.runtime';
import { aggregateTestResults, formatTestReport } from './test-output-formatter';

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
  verbose?: boolean;
  summary?: boolean;
};

export class TestCmd implements Command {
  name = 'test [component-pattern]';
  description = 'run component tests';
  extendedDescription = `executes tests using the testing framework configured by each component's environment (Jest, Mocha, etc.).
by default only runs tests for new and modified components. use --unmodified to test all components.
supports watch mode, coverage reporting, and debug mode for development workflows.`;
  helpUrl = 'reference/testing/tester-overview';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  alias = 'at';
  group = 'testing';
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
    ['', 'verbose', 'list the component ids that have no tests (default collapses them into a count)'],
    ['', 'summary', 'suppress tester output, print only the final pass/fail headline (or summary object with --json)'],
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
      verbose = false,
      summary: summaryOnly = false,
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
    // If pattern is provided, don't pass the unmodified flag as "all" - the pattern should take precedence
    const components = await this.workspace.getComponentsByUserInput(
      patternWithScope ? false : unmodified,
      patternWithScope,
      true
    );
    if (!components.length) {
      const data = formatHint(
        `no components found to test.\nuse "--unmodified" flag to test all components or specify the ids to test.\notherwise, only new and modified components will be tested`
      );
      return {
        code: 0,
        data,
      };
    }

    if (!summaryOnly) {
      this.logger.console(
        `testing total of ${components.length} components in workspace '${chalk.cyan(this.workspace.name)}'`
      );
    }

    let code = 0;
    let tests: TestResults | undefined;
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
      // testers such as Jest reassign `console.warn` to forward into `this.logger.warn` inside their `test()`,
      // bypassing our stdout/console monkey-patch. also turn the logger off so those re-routed calls don't surface.
      if (summaryOnly) this.logger.off();
      const restore = summaryOnly ? silenceConsoleAndStdout() : undefined;
      try {
        tests = await this.tester.test(components, {
          watch,
          debug,
          env,
          junit,
          coverage,
          updateSnapshot,
        });
      } finally {
        restore?.();
      }
      if (tests.hasErrors()) code = 1;
      if (process.exitCode && process.exitCode !== 0 && typeof process.exitCode === 'number') {
        // this is needed for testers such as "vitest", where it sets the exitCode to non zero when the coverage is not met.
        code = process.exitCode;
      }
    }
    const { seconds } = timer.stop();

    if (watch) return '';
    const summary = tests ? aggregateTestResults(tests, components) : undefined;
    const failedDueToExitCode = code !== 0 && !!tests && !tests.hasErrors();
    const data = summary
      ? `${summaryOnly ? '' : '\n'}${formatTestReport(summary, { verbose, duration: `${seconds}s`, summaryOnly, failedDueToExitCode })}`
      : formatHint(`tests completed in ${seconds} seconds`);
    return {
      code,
      data,
    };
  }

  async json(
    [userPattern]: [string],
    {
      watch = false,
      debug = false,
      env,
      junit,
      coverage = false,
      unmodified = false,
      updateSnapshot = false,
      summary: summaryOnly = false,
    }: TestFlags
  ): Promise<GenericObject> {
    const timer = Timer.create();
    timer.start();
    if (!this.workspace) throw new OutsideWorkspaceError();

    const getPatternWithScope = () => {
      if (!userPattern) return undefined;
      const pattern = userPattern || '**';
      return pattern;
    };
    const patternWithScope = getPatternWithScope();
    // If pattern is provided, don't pass the unmodified flag as "all" - the pattern should take precedence
    const components = await this.workspace.getComponentsByUserInput(
      patternWithScope ? false : unmodified,
      patternWithScope,
      true
    );
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

    const aggregated = aggregateTestResults(tests, components);
    const summary = {
      totals: aggregated.totals,
      componentsWithTests: aggregated.componentsWithTests.map((c) => ({
        id: c.id.toString(),
        passed: c.passed,
        failed: c.failed,
        pending: c.pending,
        hasError: c.hasError,
      })),
      componentsWithoutTests: aggregated.componentsWithoutTests.map((id) => id.toString()),
      componentsAffectedByEnvError: aggregated.componentsAffectedByEnvError.map((id) => id.toString()),
      envErrors: aggregated.envErrors.map((e) => ({ envId: e.envId, message: e.error.message })),
    };

    if (summaryOnly) {
      return { code, data: summary };
    }

    const data = tests.results.map((r) => ({
      data: {
        components: r.data?.components.map((c) => ({
          ...c,
          componentId: c.componentId.toString(),
        })),
        errors: r.data?.errors,
      },
      error: r.error,
    }));

    return {
      code,
      data,
    };
  }
}

/**
 * Disables all console logging (via console.*) and direct writes to
 * process.stdout / process.stderr. Returns a function that, when called,
 * restores everything back to normal.
 */
function silenceConsoleAndStdout(): () => void {
  const CONSOLE_METHODS = ['log', 'warn', 'error', 'info', 'debug'] as const;
  const originalConsole = Object.fromEntries(
    // eslint-disable-next-line no-console
    CONSOLE_METHODS.map((m) => [m, console[m]])
  ) as Record<(typeof CONSOLE_METHODS)[number], (...args: any[]) => void>;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  for (const method of CONSOLE_METHODS) {
    // eslint-disable-next-line no-console
    console[method] = () => {};
  }

  // process.stdout.write(chunk, encoding?, callback?) — callers may rely on the optional
  // callback firing. Invoke it so we don't leave writers hanging.
  const stubWrite = (...args: any[]): boolean => {
    const cb = args.find((a) => typeof a === 'function') as ((err?: Error | null) => void) | undefined;
    if (cb) cb();
    return true;
  };
  process.stdout.write = stubWrite as typeof process.stdout.write;
  process.stderr.write = stubWrite as typeof process.stderr.write;

  return () => {
    for (const method of CONSOLE_METHODS) {
      // eslint-disable-next-line no-console
      console[method] = originalConsole[method];
    }
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  };
}
