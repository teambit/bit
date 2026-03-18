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
  skippedAll?: boolean;
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

  async validate(
    components: Component[],
    continueOnError = false,
    skipTasks: string[] = []
  ): Promise<ValidationResult> {
    const steps: { label: string; run: () => Promise<ValidationResult> }[] = [];

    if (!skipTasks.includes('check-types')) {
      steps.push({ label: 'Type Checking', run: () => this.checkTypes(components) });
    }
    if (!skipTasks.includes('lint')) {
      steps.push({ label: 'Linting', run: () => this.lint(components) });
    }
    if (!skipTasks.includes('test')) {
      steps.push({ label: 'Testing', run: () => this.test(components) });
    }

    if (steps.length === 0) {
      return { code: 0, message: 'all tasks were skipped', skippedAll: true };
    }

    const total = steps.length;
    const results: ValidationResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      this.logger.console(chalk.cyan(`${i > 0 ? '\n' : ''}${i + 1}/${total} ${step.label}...`));
      const result = await step.run();
      this.logger.console(result.message);
      results.push(result);
      if (result.code !== 0 && !continueOnError) return result;
    }

    // When continueOnError is true, return the first error found, or success if all passed
    const firstError = results.find((r) => r.code !== 0);
    return firstError || results[results.length - 1];
  }

  private async checkTypes(components: Component[]): Promise<ValidationResult> {
    const files = this.typescript.getSupportedFilesForTsserver(components);

    await this.typescript.initTsserverClientFromWorkspace(
      { aggregateDiagnosticData: false, printTypeErrors: true },
      files
    );

    const tsserver = this.typescript.getTsserverClient();
    if (!tsserver) throw new Error('unable to start tsserver');

    try {
      const BATCH_SIZE = 50;
      await tsserver.getDiagnostic(files, files.length > BATCH_SIZE ? BATCH_SIZE : undefined);
    } catch (err: any) {
      tsserver.killTsServer();
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        code: 1,
        message: `type checking failed: ${errMsg}`,
      };
    }
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
