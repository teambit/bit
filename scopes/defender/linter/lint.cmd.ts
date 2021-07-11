import { TimerResponse, Timer } from '@teambit/legacy/dist/toolbox/timer';
import { Command, CommandOptions } from '@teambit/cli';
import { ComponentFactory, ComponentID } from '@teambit/component';
import { Logger } from '@teambit/logger';
import { EnvsExecutionResult } from '@teambit/envs';
import { Workspace } from '@teambit/workspace';
import { compact, flatten } from 'lodash';
import { LinterMain } from './linter.main.runtime';
import { ComponentLintResult, LintResults } from './linter';

export type LinterOptions = {
  changed?: boolean;
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
  duration: TimerResponse;
  data: JsonLintDataResults;
  componentsIdsToLint: string[];
};

export class LintCmd implements Command {
  name = 'lint [component...]';
  description = 'lint components in the development workspace';
  group = 'development';
  options = [
    ['c', 'changed', 'lint only new and modified components'],
    ['j', 'json', 'return the lint results in json format'],
  ] as CommandOptions;

  constructor(
    private linter: LinterMain,
    private componentHost: ComponentFactory,
    private logger: Logger,
    private workspace: Workspace
  ) {}

  async report([components = []]: [string[]], linterOptions: LinterOptions) {
    const { duration, data, componentsIdsToLint } = await this.json([components], linterOptions);
    this.logger.consoleTitle(
      `linting total of ${componentsIdsToLint.length} in workspace '${this.componentHost.name}'`
    );

    data.results.forEach((lintRes) => {
      this.logger.consoleTitle(`${lintRes.componentId.toString({ ignoreVersion: true })}`);
      this.logger.console(lintRes.output);
    });

    const { seconds } = duration;
    return `linted ${componentsIdsToLint.length} components in ${seconds}.`;
  }

  async json([components = []]: [string[]], linterOptions: LinterOptions): Promise<JsonLintResults> {
    const timer = Timer.create();
    timer.start();
    const componentsIds = await this.getIdsToLint(components, linterOptions.changed);
    const componentsToLint = await this.workspace.getMany(componentsIds);
    const linterResults = await this.linter.lint(componentsToLint);
    const jsonLinterResults = toJsonLintResults(linterResults);
    const timerResponse = timer.stop();
    return {
      duration: timerResponse,
      data: jsonLinterResults,
      componentsIdsToLint: componentsToLint.map((comp) => comp.id.toString()),
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
  const newResults = results.results.map((res) => {
    const resultsWithoutComponent = res.data?.results.map((result) => {
      return {
        componentId: result.component.id,
        output: result.output,
        results: result.results,
      };
    });
    return compact(resultsWithoutComponent);
  });
  return {
    results: compact(flatten(newResults)),
    errors: results?.errors,
  };
}
