import { TimerResponse, Timer } from '@teambit/legacy/dist/toolbox/timer';
import { Command, CommandOptions } from '@teambit/cli';
import { ComponentFactory, ComponentID } from '@teambit/component';
import chalk from 'chalk';
import { EnvsExecutionResult } from '@teambit/envs';
import { Workspace } from '@teambit/workspace';
import { compact, flatten, omit } from 'lodash';
import { LinterMain } from './linter.main.runtime';
import { ComponentLintResult, LintResults } from './linter';
import { FixTypes, LinterOptions } from './linter-context';

export type LintCmdOptions = {
  changed?: boolean;
  fix?: boolean;
  fixType?: string;
  json?: boolean;
};

/**
 * A type for result with componentId instead of the entire component, as when output to console, we don't want to print all the component
 */
export type JsonComponentLintResult = Omit<ComponentLintResult, 'component'> & {
  componentId: ComponentID;
};

export type JsonLintDataResults = Omit<LintResults, 'results'> & { results: JsonComponentLintResult[] };
/**
 * A type for result with componentId instead of the entire component, as when output to console, we don't want to print all the component
 */
export type JsonLintResults = {
  code: number;
  data: {
    duration: TimerResponse;
    lintResults: JsonLintDataResults;
    componentsIdsToLint: string[];
  };
};

export class LintCmd implements Command {
  name = 'lint [component...]';
  description = 'lint components in the development workspace';
  group = 'development';
  options = [
    ['c', 'changed', 'lint only new and modified components'],
    ['f', 'fix', 'automatically fix problems'],
    ['', 'fix-type <fixType>', 'specify the types of fixes to apply (problem, suggestion, layout)'],
    ['j', 'json', 'return the lint results in json format'],
  ] as CommandOptions;

  constructor(private linter: LinterMain, private componentHost: ComponentFactory, private workspace: Workspace) {}

  async report([components = []]: [string[]], linterOptions: LintCmdOptions) {
    const { code, data } = await this.json([components], linterOptions);
    const { duration, lintResults, componentsIdsToLint } = data;
    const title = chalk.bold(
      `linting total of ${chalk.cyan(componentsIdsToLint.length.toString())} component(s) in workspace '${chalk.cyan(
        this.componentHost.name
      )}'`
    );

    const componentsOutputs = lintResults.results
      .map((lintRes) => {
        const compTitle = chalk.bold.cyan(lintRes.componentId.toString({ ignoreVersion: true }));
        const compOutput = lintRes.output;
        return `${compTitle}\n${compOutput}`;
      })
      .join('\n');

    const { seconds } = duration;
    const summery = `linted ${chalk.cyan(componentsIdsToLint.length.toString())} components in ${chalk.cyan(
      seconds.toString()
    )}.`;
    return { code, data: `${title}\n\n${componentsOutputs}\n\n${summery}` };
  }

  async json([components = []]: [string[]], linterOptions: LintCmdOptions): Promise<JsonLintResults> {
    const timer = Timer.create();
    timer.start();
    const componentsIds = await this.getIdsToLint(components, linterOptions.changed);
    const componentsToLint = await this.workspace.getMany(componentsIds);
    const opts: LinterOptions = {
      fix: linterOptions.fix,
      fixTypes: linterOptions.fixType ? (linterOptions.fixType.split(',') as FixTypes) : undefined,
    };
    const linterResults = await this.linter.lint(componentsToLint, opts);
    const jsonLinterResults = toJsonLintResults(linterResults);
    // console.log('jsonLinterResults', JSON.stringify(jsonLinterResults, null, 2));
    const timerResponse = timer.stop();
    let code = 0;
    if (jsonLinterResults.totalErrorCount || jsonLinterResults.totalFatalErrorCount) {
      code = 1;
    }
    return {
      code,
      data: {
        duration: timerResponse,
        lintResults: jsonLinterResults,
        componentsIdsToLint: componentsToLint.map((comp) => comp.id.toString()),
      },
    };
  }

  private async getIdsToLint(components: string[], changed = false): Promise<ComponentID[]> {
    if (components.length) {
      return this.workspace.resolveMultipleComponentIds(components);
    }
    if (changed) {
      return this.workspace.getNewAndModifiedIds();
    }
    return this.componentHost.listIds();
  }
}

function toJsonLintResults(results: EnvsExecutionResult<LintResults>): JsonLintDataResults {
  let totalErrorCount = 0;
  let totalFatalErrorCount = 0;
  let totalFixableErrorCount = 0;
  let totalFixableWarningCount = 0;
  let totalWarningCount = 0;
  const newResults = results.results.map((res) => {
    const resultsWithoutComponent = res.data?.results.map((result) => {
      return Object.assign({}, { componentId: result.component.id }, omit(result, ['component']));
    });

    if (res.data) {
      totalErrorCount += res.data.totalErrorCount ?? 0;
      totalFatalErrorCount += res.data.totalFatalErrorCount ?? 0;
      totalFixableErrorCount += res.data.totalFixableErrorCount ?? 0;
      totalFixableWarningCount += res.data.totalFixableWarningCount ?? 0;
      totalWarningCount += res.data.totalWarningCount ?? 0;
    }

    return compact(resultsWithoutComponent);
  });
  return {
    results: compact(flatten(newResults)),
    totalErrorCount,
    totalFatalErrorCount,
    totalFixableErrorCount,
    totalFixableWarningCount,
    totalWarningCount,
    errors: results?.errors,
  };
}
