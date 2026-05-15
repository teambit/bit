import type { Command, CommandOptions } from '@teambit/cli';
import { formatSuccessSummary, formatWarningSummary, formatHint, joinSections } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import type { PubsubMain } from '@teambit/pubsub';
import prettyTime from 'pretty-time';
import { formatCompileResults } from './output-formatter';
import type { WorkspaceCompiler, CompileOptions, BuildResult } from './workspace-compiler';
import { CompilationInitiator } from './types';
import { compileCommand } from './compiler.commands';

export class CompileCmd implements Command {
  name = compileCommand.name;
  description = compileCommand.description;
  extendedDescription = compileCommand.extendedDescription;
  helpUrl = compileCommand.helpUrl;
  arguments = compileCommand.arguments;
  alias = compileCommand.alias;
  group = compileCommand.group;
  options = compileCommand.options;
  loader = compileCommand.loader;

  constructor(
    private compile: WorkspaceCompiler,
    private logger: Logger,
    private pubsub: PubsubMain
  ) {}

  async report([components = []]: [string[]], compilerOptions: CompileOptions) {
    const startTimestamp = process.hrtime();
    this.logger.setStatusLine('compiling components...');

    const results = await this.compile.compileComponents(components, {
      ...compilerOptions,
      initiator: CompilationInitiator.CmdReport,
    });
    const compileTimeLength = process.hrtime(startTimestamp);

    const compiledOutput = formatCompileResults(results, !!compilerOptions.verbose);
    const summaryLine = this.getSummaryLine(results);
    const timingLine = formatHint(`Finished. (${prettyTime(compileTimeLength)})`);

    this.logger.clearStatusLine();

    return {
      data: joinSections([compiledOutput, `${summaryLine}\n${timingLine}`]),
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

  private getExitCode(componentsStatus: BuildResult[]) {
    return this.failedComponents(componentsStatus).length ? 1 : 0;
  }

  private getSummaryLine(componentsStatus: BuildResult[]) {
    const numberOfComponents = componentsStatus.length;
    const numberOfFailingComponents = this.failedComponents(componentsStatus).length;
    const numberOfSuccessfulComponents = componentsStatus.filter((component) => !component.errors.length).length;

    if (numberOfFailingComponents) {
      return formatWarningSummary(`${numberOfFailingComponents}/${numberOfComponents} components failed to compile.`);
    }
    return formatSuccessSummary(
      `${numberOfSuccessfulComponents}/${numberOfComponents} components compiled successfully.`
    );
  }
}
