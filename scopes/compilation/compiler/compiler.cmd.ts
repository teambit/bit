import { Command, CommandOptions } from '@teambit/cli';
import { Logger } from '@teambit/logger';
import type { PubsubMain, BitBaseEvent } from '@teambit/pubsub';
import chalk from 'chalk';
import prettyTime from 'pretty-time';
import type ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { formatCompileResults } from './output-formatter';
import { CompileError, WorkspaceCompiler, CompileOptions } from './workspace-compiler';

// IDs & events
import { CompilerAspect } from './compiler.aspect';
import { ComponentCompilationOnDoneEvent } from './events';

type ComponentsStatus = {
  buildResults: string[];
  component: Array<ConsumerComponent>;
  errors: Array<CompileError>;
};

export class CompileCmd implements Command {
  componentsStatus: Array<ComponentsStatus> = [];
  name = 'compile [component...]';
  description = 'compile components in the development workspace';
  alias = '';
  group = 'development';
  options = [
    ['c', 'changed', 'compile only new and modified components'],
    ['v', 'verbose', 'show more data, such as, dist paths'],
    ['j', 'json', 'return the compile results in json format'],
  ] as CommandOptions;

  constructor(private compile: WorkspaceCompiler, private logger: Logger, private pubsub: PubsubMain) {}

  async report([components]: [string[]], compilerOptions: CompileOptions) {
    const startTimestamp = process.hrtime();
    this.logger.setStatusLine('Compiling your components, hold tight.');
    this.pubsub.sub(CompilerAspect.id, this.onComponentCompilationDone.bind(this));

    let outputString = '';
    compilerOptions.deleteDistDir = true;
    await this.compile.compileComponents(components, compilerOptions);
    const compileTimeLength = process.hrtime(startTimestamp);

    outputString += '\n';
    outputString += `  ${chalk.underline('STATUS')}\t${chalk.underline('COMPONENT ID')}\n`;
    outputString += formatCompileResults(this.componentsStatus, compilerOptions.verbose);
    outputString += '\n';

    outputString += this.getStatusLine(this.componentsStatus, compileTimeLength);

    this.logger.clearStatusLine();

    return {
      data: outputString,
      code: this.getExitCode(this.componentsStatus),
    };
  }

  async json([components]: [string[]], compilerOptions: CompileOptions) {
    compilerOptions.deleteDistDir = true;
    // @ts-ignore
    const compileResults = await this.compile.compileComponents(components, compilerOptions);
    return {
      data: compileResults,
      // @todo: fix the code once compile is ready.
      code: 0,
    };
  }

  private failedComponents(componentsStatus: ComponentsStatus[]): ComponentsStatus[] {
    return componentsStatus.filter((component) => component.errors.length);
  }

  private getSummaryIcon(componentsStatus: ComponentsStatus[]) {
    switch (this.failedComponents(componentsStatus).length) {
      case 0:
        return chalk.green('✔');
      case componentsStatus.length:
        return chalk.red('✗');
      default:
        return chalk.yellow('⍻');
    }
  }

  private getExitCode(componentsStatus: ComponentsStatus[]) {
    return this.failedComponents(componentsStatus).length ? 1 : 0;
  }

  private getStatusLine(componentsStatus: ComponentsStatus[], compileTimeLength) {
    const numberOfComponents = componentsStatus.length;
    const numberOfFailingComponents = this.failedComponents(componentsStatus).length;
    const numberOfSuccessfulComponents = componentsStatus.filter((component) => !component.errors.length).length;

    const icon = this.getSummaryIcon(componentsStatus);
    const summaryLine = numberOfFailingComponents
      ? `${icon} ${numberOfFailingComponents}/${numberOfComponents} components failed to compile.`
      : `${icon} ${numberOfSuccessfulComponents}/${numberOfComponents} components compiled successfully.`;

    return `${summaryLine}\nFinished. (${prettyTime(compileTimeLength)})`;
  }

  private onComponentCompilationDone(event: BitBaseEvent<any>) {
    if (event.type === ComponentCompilationOnDoneEvent.TYPE) {
      this.componentsStatus.push(event.data);
    }
  }
}
