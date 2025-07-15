import { TimerResponse, Timer } from '@teambit/toolbox.time.timer';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
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
  code: number;
  componentsIdsToFormat: string[];
};

export class FormatCmd implements Command {
  name = 'format [component-pattern]';
  description = 'format components in the development workspace';
  arguments = [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }];
  group = 'testing';
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

  async report([pattern]: [string], formatterOptions: FormatCmdOptions) {
    const { duration, data, code, componentsIdsToFormat } = await this.json([pattern], formatterOptions);

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

    return {
      data: `${title}\n\n${componentsOutputs}\n\n${summery}`,
      code,
    };
  }

  async json([pattern]: [string], formatterCmdOptions: FormatCmdOptions): Promise<JsonFormatResults> {
    const timer = Timer.create();
    timer.start();
    const componentsIds = await this.getIdsToFormat(pattern, formatterCmdOptions.changed);
    const componentsToFormat = await this.workspace.getMany(componentsIds);
    const opts: FormatterOptions = {};
    const formatterResults = formatterCmdOptions.check
      ? await this.formatter.check(componentsToFormat, opts)
      : await this.formatter.format(componentsToFormat, opts);
    const jsonFormatterResults = toJsonFormatResults(formatterResults);
    const timerResponse = timer.stop();
    const statusCode = this.getStatusCode(jsonFormatterResults, formatterCmdOptions.check);

    return {
      duration: timerResponse,
      data: jsonFormatterResults,
      code: statusCode,
      componentsIdsToFormat: componentsToFormat.map((comp) => comp.id.toString()),
    };
  }

  private getStatusCode(results: JsonFormatDataResults, check = false): number {
    if (!check) return 0;
    const hasIssues = results.results.some((comp) => comp.results.some((file) => file.hasIssues));
    if (hasIssues) return 1;
    return 0;
  }

  private async getIdsToFormat(pattern: string, changed = false): Promise<ComponentID[]> {
    if (pattern) {
      return this.workspace.idsByPattern(pattern);
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
