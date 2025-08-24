import type { Command, CommandOptions } from '@teambit/cli';
import { Logger } from '@teambit/logger';
import type { PubsubMain } from '@teambit/pubsub';
import chalk from 'chalk';
import prettyTime from 'pretty-time';
import { formatCompileResults } from './output-formatter';
import type { WorkspaceCompiler, CompileOptions, BuildResult } from './workspace-compiler';
import { CompilationInitiator } from './types';

export class CompileCmd implements Command {
  name = 'compile [component-names...]';
  description = 'compile components in the workspace';
  helpUrl = 'reference/compiling/compiler-overview';
  arguments = [
    {
      name: 'component-names...',
      description: 'a list of component names or component IDs (defaults to all components)',
    },
  ];
  alias = '';
  group = 'component-development';
  options = [
    ['c', 'changed', 'compile only new and modified components'],
    ['v', 'verbose', 'show more data, such as, dist paths'],
    ['j', 'json', 'return the compile results in json format'],
    ['d', 'delete-dist-dir', 'delete existing dist folder before writing new compiled files'],
    ['', 'generate-types', 'EXPERIMENTAL. generate d.ts files for typescript components (hurts performance)'],
  ] as CommandOptions;

  constructor(
    private compile: WorkspaceCompiler,
    private logger: Logger,
    private pubsub: PubsubMain
  ) {}

  async report([components = []]: [string[]], compilerOptions: CompileOptions) {
    const startTimestamp = process.hrtime();
    this.logger.setStatusLine('Compiling your components, hold tight.');

    let outputString = '';
    const results = await this.compile.compileComponents(components, {
      ...compilerOptions,
      initiator: CompilationInitiator.CmdReport,
    });
    const compileTimeLength = process.hrtime(startTimestamp);

    outputString += '\n';
    outputString += `  ${chalk.underline('STATUS')}\t${chalk.underline('COMPONENT ID')}\n`;
    outputString += formatCompileResults(results, !!compilerOptions.verbose);
    outputString += '\n';

    outputString += this.getStatusLine(results, compileTimeLength);

    this.logger.clearStatusLine();

    return {
      data: outputString,
      code: this.getExitCode(results),
    };
  }

  async json([components]: [string[]], compilerOptions: CompileOptions) {
    compilerOptions.deleteDistDir = true;
    const compileResults = await this.compile.compileComponents(components, {
      ...compilerOptions,
      initiator: CompilationInitiator.CmdJson,
    });
    return {
      data: compileResults,
      // @todo: fix the code once compile is ready.
      code: 0,
    };
  }

  private failedComponents(componentsStatus: BuildResult[]): BuildResult[] {
    return componentsStatus.filter((component) => component.errors.length);
  }

  private getSummaryIcon(componentsStatus: BuildResult[]) {
    switch (this.failedComponents(componentsStatus).length) {
      case 0:
        return Logger.successSymbol();
      case componentsStatus.length:
        return chalk.red('✗');
      default:
        return chalk.yellow('⍻');
    }
  }

  private getExitCode(componentsStatus: BuildResult[]) {
    return this.failedComponents(componentsStatus).length ? 1 : 0;
  }

  private getStatusLine(componentsStatus: BuildResult[], compileTimeLength) {
    const numberOfComponents = componentsStatus.length;
    const numberOfFailingComponents = this.failedComponents(componentsStatus).length;
    const numberOfSuccessfulComponents = componentsStatus.filter((component) => !component.errors.length).length;

    const icon = this.getSummaryIcon(componentsStatus);
    const summaryLine = numberOfFailingComponents
      ? `${icon} ${numberOfFailingComponents}/${numberOfComponents} components failed to compile.`
      : `${icon} ${numberOfSuccessfulComponents}/${numberOfComponents} components compiled successfully.`;

    return `${summaryLine}\nFinished. (${prettyTime(compileTimeLength)})`;
  }
}
