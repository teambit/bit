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
export type JsonLintResultsData = {
  duration: TimerResponse;
  lintResults: JsonLintDataResults;
  componentsIdsToLint: string[];
};

export type JsonLintResults = {
  code: number;
  data: JsonLintResultsData;
};

export class LintCmd implements Command {
  name = 'lint [component...]';
  description = 'lint components in the development workspace';
  helpUrl = 'reference/linting/linter-overview';
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
    const { lintResults, componentsIdsToLint } = data;
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

    const summary = this.getSummarySection(data);
    return { code, data: `${title}\n\n${componentsOutputs}\n\n${summary}` };
  }

  private getSummarySection(data: JsonLintResultsData) {
    const { duration, lintResults, componentsIdsToLint } = data;
    const { seconds } = duration;
    const summaryTitle = `linted ${chalk.cyan(componentsIdsToLint.length.toString())} components in ${chalk.cyan(
      seconds.toString()
    )} seconds`;

    const totalFieldsMap = [
      { itemsDataField: 'totalErrorCount', componentsDataField: 'totalComponentsWithErrorCount', label: 'Errors' },
      {
        itemsDataField: 'totalFatalErrorCount',
        componentsDataField: 'totalComponentsWithFatalErrorCount',
        label: 'FatalErrors',
      },
      {
        itemsDataField: 'totalFixableErrorCount',
        componentsDataField: 'totalComponentsWithFixableErrorCount',
        label: 'FixableErrors',
      },
      {
        itemsDataField: 'totalFixableWarningCount',
        componentsDataField: 'totalComponentsWithFixableWarningCount',
        label: 'FixableWarnings',
      },
      {
        itemsDataField: 'totalWarningCount',
        componentsDataField: 'totalComponentsWithWarningCount',
        label: 'Warnings',
      },
    ];

    const summaryTotals = totalFieldsMap
      .map((item) =>
        this.renderTotalLine(lintResults[item.componentsDataField], lintResults[item.itemsDataField], item.label)
      )
      .filter(Boolean)
      .join('\n');
    const summary = `${summaryTitle}\n${summaryTotals}`;
    return summary;
  }

  private renderTotalLine(componentsCount: number, itemsCount: number, fieldLabel: string): string | undefined {
    if (itemsCount === 0) return undefined;
    return `total of ${chalk.green(itemsCount.toString())} ${chalk.cyan(fieldLabel)} (from ${chalk.green(
      componentsCount.toString()
    )} components)`;
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
  let totalComponentsWithErrorCount = 0;
  let totalComponentsWithFatalErrorCount = 0;
  let totalComponentsWithFixableErrorCount = 0;
  let totalComponentsWithFixableWarningCount = 0;
  let totalComponentsWithWarningCount = 0;

  const newResults = results.results.map((res) => {
    const resultsWithoutComponent = res.data?.results.map((result) => {
      return Object.assign({}, { componentId: result.component.id }, omit(result, ['component']));
    });

    if (res.data) {
      if (res.data.totalErrorCount) {
        totalErrorCount += res.data.totalErrorCount;
        totalComponentsWithErrorCount += res.data.totalComponentsWithErrorCount ?? 0;
      }
      if (res.data.totalFatalErrorCount) {
        totalFatalErrorCount += res.data.totalFatalErrorCount;
        totalComponentsWithFatalErrorCount += res.data.totalComponentsWithFatalErrorCount ?? 0;
      }
      if (res.data.totalFixableErrorCount) {
        totalFixableErrorCount += res.data.totalFixableErrorCount;
        totalComponentsWithFixableErrorCount += res.data.totalComponentsWithFixableErrorCount ?? 0;
      }
      if (res.data.totalFixableWarningCount) {
        totalFixableWarningCount += res.data.totalFixableWarningCount;
        totalComponentsWithFixableWarningCount += res.data.totalComponentsWithFixableWarningCount ?? 0;
      }
      if (res.data.totalWarningCount) {
        totalWarningCount += res.data.totalWarningCount;
        totalComponentsWithWarningCount += res.data.totalComponentsWithWarningCount ?? 0;
      }
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
    totalComponentsWithErrorCount,
    totalComponentsWithFatalErrorCount,
    totalComponentsWithFixableErrorCount,
    totalComponentsWithFixableWarningCount,
    totalComponentsWithWarningCount,
    errors: results?.errors,
  };
}
