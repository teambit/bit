import { TimerResponse, Timer } from '@teambit/legacy/dist/toolbox/timer';
import { Command, CommandOptions } from '@teambit/cli';
import { ComponentFactory, ComponentID } from '@teambit/component';
import chalk from 'chalk';
import { EnvsExecutionResult } from '@teambit/envs';
import { Workspace } from '@teambit/workspace';
import { compact, flatten } from 'lodash';
import { FormatterMain } from './formatter.main.runtime';
import { ComponentFormatResult, FormatResults, FileFormatResult } from './formatter';
import { FormatterOptions } from './formatter-context';

export type FormatCmdOptions = {
  changed?: boolean;
  json?: boolean;
  check?: boolean;
};

type OutputContext = {
  check?: boolean;
};

/**
 * A type for result with componentId instead of the entire component, as when output to console, we don't want to print all the component
 */
export type JsonComponentFormatResult = Omit<ComponentFormatResult, 'component'> & {
  componentId: ComponentID;
};

export type JsonFormatDataResults = Omit<FormatResults, 'results'> & { results: JsonComponentFormatResult[] };
/**
 * A type for result with componentId instead of the entire component, as when output to console, we don't want to print all the component
 */
export type JsonFormatResults = {
  duration: TimerResponse;
  data: JsonFormatDataResults;
  componentsIdsToFormat: string[];
};

export class FormatCmd implements Command {
  name = 'format [component...]';
  description = 'format components in the development workspace';
  group = 'development';
  helpUrl = 'reference/formatting/formatter-overview';
  options = [
    ['c', 'changed', 'format only new and modified components'],
    ['', 'check', 'will output a human-friendly message and a list of unformatted files, if any'],
    ['j', 'json', 'return the format results in json format'],
  ] as CommandOptions;

  constructor(
    private formatter: FormatterMain,
    private componentHost: ComponentFactory,
    private workspace: Workspace
  ) {}

  async report([components = []]: [string[]], formatterOptions: FormatCmdOptions) {
    const { duration, data, componentsIdsToFormat } = await this.json([components], formatterOptions);

    const title = chalk.bold(
      `formatting total of ${chalk.cyan(
        componentsIdsToFormat.length.toString()
      )} component(s) in workspace '${chalk.cyan(this.componentHost.name)}`
    );

    const componentsOutputs = this.getAllComponentsResultOutput(data.results, { check: formatterOptions.check });

    const { seconds } = duration;
    const summery = `formatted ${chalk.cyan(componentsIdsToFormat.length.toString())} components in ${chalk.cyan(
      seconds.toString()
    )}.`;

    return `${title}\n\n${componentsOutputs}\n\n${summery}`;
  }

  async json([components = []]: [string[]], formatterCmdOptions: FormatCmdOptions): Promise<JsonFormatResults> {
    const timer = Timer.create();
    timer.start();
    const componentsIds = await this.getIdsToFormat(components, formatterCmdOptions.changed);
    const componentsToFormat = await this.workspace.getMany(componentsIds);
    const opts: FormatterOptions = {};
    const formatterResults = formatterCmdOptions.check
      ? await this.formatter.check(componentsToFormat, opts)
      : await this.formatter.format(componentsToFormat, opts);
    const jsonFormatterResults = toJsonFormatResults(formatterResults);
    const timerResponse = timer.stop();
    return {
      duration: timerResponse,
      data: jsonFormatterResults,
      componentsIdsToFormat: componentsToFormat.map((comp) => comp.id.toString()),
    };
  }

  private async getIdsToFormat(components: string[], changed = false): Promise<ComponentID[]> {
    if (components.length) {
      return this.workspace.resolveMultipleComponentIds(components);
    }
    if (changed) {
      return this.workspace.getNewAndModifiedIds();
    }
    return this.componentHost.listIds();
  }

  private getAllComponentsResultOutput(componentsResult: JsonComponentFormatResult[], context: OutputContext) {
    const allResults = componentsResult.map((comp) => this.getOneComponentResultOutput(comp, context));
    return allResults.join('\n\n');
  }

  private getOneComponentResultOutput(componentResult: JsonComponentFormatResult, context: OutputContext) {
    const title = chalk.bold.cyan(componentResult.componentId.toString({ ignoreVersion: true }));
    const filesWithIssues = componentResult.results.filter((fileResult) => fileResult.hasIssues);
    if (!filesWithIssues || !filesWithIssues.length) {
      return `${title}\n${chalk.green('no issues found')}`;
    }
    let subTitle = chalk.green('the following files have been re-formatted:');
    if (context.check) {
      subTitle = chalk.red('issues found in the following files:');
    }
    const files = filesWithIssues.map(this.getOneComponentFileResultOutput);
    return `${title}\n${subTitle}\n${files.join('\n')}`;
  }

  private getOneComponentFileResultOutput(fileResult: FileFormatResult) {
    return fileResult.filePath;
  }
}

function toJsonFormatResults(results: EnvsExecutionResult<FormatResults>): JsonFormatDataResults {
  const newResults = results.results.map((res) => {
    const resultsWithoutComponent = res.data?.results.map((result) => {
      return {
        componentId: result.component.id,
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
