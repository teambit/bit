import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import type { LoggerMain, Logger } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { TypescriptMain } from '@teambit/typescript';
import { TypescriptAspect } from '@teambit/typescript';
import type { LinterMain } from '@teambit/linter';
import { LinterAspect } from '@teambit/linter';
import type { TesterMain } from '@teambit/tester';
import { TesterAspect } from '@teambit/tester';
import type { Component } from '@teambit/component';
import chalk from 'chalk';
import { ValidatorAspect } from './validator.aspect';
import { ValidateCmd } from './validate.cmd';

export type ValidationResult = {
  code: number;
  message: string;
};

export class ValidatorMain {
  static runtime = MainRuntime;
  static dependencies = [CLIAspect, WorkspaceAspect, LoggerAspect, TypescriptAspect, LinterAspect, TesterAspect];

  constructor(
    private workspace: Workspace,
    private typescript: TypescriptMain,
    private linter: LinterMain,
    private tester: TesterMain,
    private logger: Logger
  ) {}

  async validate(components: Component[], continueOnError = false): Promise<ValidationResult> {
    // Step 1: Check types
    this.logger.console(chalk.cyan('1/3 Type Checking...'));
    const checkTypesResult = await this.checkTypes(components);
    this.logger.console(checkTypesResult.message);
    if (checkTypesResult.code !== 0 && !continueOnError) return checkTypesResult;

    // Step 2: Lint
    this.logger.console(chalk.cyan('\n2/3 Linting...'));
    const lintResult = await this.lint(components);
    this.logger.console(lintResult.message);
    if (lintResult.code !== 0 && !continueOnError) return lintResult;

    // Step 3: Test
    this.logger.console(chalk.cyan('\n3/3 Testing...'));
    const testResult = await this.test(components);
    this.logger.console(testResult.message);

    // When continueOnError is true, return the first error found, or success if all passed
    if (continueOnError) {
      if (checkTypesResult.code !== 0) return checkTypesResult;
      if (lintResult.code !== 0) return lintResult;
    }
    return testResult;
  }

  private async checkTypes(components: Component[]): Promise<ValidationResult> {
    const files = this.typescript.getSupportedFilesForTsserver(components);

    await this.typescript.initTsserverClientFromWorkspace(
      { aggregateDiagnosticData: false, printTypeErrors: true },
      files
    );

    const tsserver = this.typescript.getTsserverClient();
    if (!tsserver) throw new Error('unable to start tsserver');

    await tsserver.getDiagnostic(files);
    const errorCount = tsserver.lastDiagnostics.length;
    tsserver.killTsServer();

    return {
      code: errorCount > 0 ? 1 : 0,
      message: errorCount > 0 ? `found errors in ${errorCount} files` : 'no type errors found',
    };
  }

  private async lint(components: Component[]): Promise<ValidationResult> {
    const linterResults = await this.linter.lint(components, {});

    let totalErrors = 0;
    let totalWarnings = 0;
    const dirtyComponents: string[] = [];

    linterResults.results.forEach((res) => {
      if (res.data) {
        const componentErrors = (res.data.totalErrorCount || 0) + (res.data.totalFatalErrorCount || 0);
        totalErrors += componentErrors;
        totalWarnings += res.data.totalWarningCount || 0;

        // Show detailed output for components with errors
        res.data.results.forEach((compResult) => {
          const hasErrors = compResult.totalErrorCount > 0 || (compResult.totalFatalErrorCount || 0) > 0;
          if (hasErrors && compResult.output) {
            const compTitle = chalk.bold.cyan(compResult.component.id.toString({ ignoreVersion: true }));
            dirtyComponents.push(`${compTitle}\n${compResult.output}`);
          }
        });
      }
    });

    let message = '';
    if (dirtyComponents.length > 0) {
      message = dirtyComponents.join('\n\n') + '\n\n';
    }
    message +=
      totalErrors > 0
        ? `found ${totalErrors} error(s) and ${totalWarnings} warning(s)`
        : totalWarnings > 0
          ? `found ${totalWarnings} warning(s), no errors`
          : 'no linting issues found';

    return {
      code: totalErrors > 0 ? 1 : 0,
      message,
    };
  }

  private async test(components: Component[]): Promise<ValidationResult> {
    if (components.length === 0) {
      return { code: 0, message: 'no components found to test' };
    }

    const tests = await this.tester.test(components, { watch: false, debug: false });
    const hasErrors = tests.hasErrors();

    return {
      code: hasErrors ? 1 : 0,
      message: hasErrors ? 'tests failed' : `all tests passed for ${components.length} component(s)`,
    };
  }

  static async provider([cli, workspace, loggerAspect, typescript, linter, tester]: [
    CLIMain,
    Workspace,
    LoggerMain,
    TypescriptMain,
    LinterMain,
    TesterMain,
  ]) {
    const logger = loggerAspect.createLogger(ValidatorAspect.id);
    const validator = new ValidatorMain(workspace, typescript, linter, tester, logger);
    cli.register(new ValidateCmd(validator, workspace, logger));
    return validator;
  }
}

ValidatorAspect.addRuntime(ValidatorMain);
