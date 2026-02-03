import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { OutsideWorkspaceError } from '@teambit/workspace';
import type { TsserverClient, DiagnosticData } from '@teambit/ts-server';
import chalk from 'chalk';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { TypescriptMain } from '../typescript.main.runtime';

export class CheckTypesCmd implements Command {
  name = 'check-types [component-pattern]';
  description = 'validate TypeScript type correctness';
  extendedDescription = `checks for TypeScript type errors in component files, similar to running tsc.
by default only checks new and modified components. use --unmodified to check all components.
useful for catching type issues before tagging, snapping or building components.`;
  arguments = [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }];
  alias = '';
  group = 'testing';
  options = [
    ['a', 'all', 'DEPRECATED. (use --unmodified)'],
    ['u', 'unmodified', 'check-types for all components, not only modified and new'],
    ['', 'strict', 'in case issues found, exit with code 1'],
    ['j', 'json', 'return the output in json format'],
  ] as CommandOptions;

  constructor(
    private typescript: TypescriptMain,
    private workspace: Workspace,
    private logger: Logger
  ) {}

  async report(
    [pattern]: [string],
    { all = false, unmodified = false, strict = false }: { all: boolean; unmodified: boolean; strict: boolean }
  ) {
    const effectiveUnmodified = this.handleDeprecatedAllFlag(all, unmodified);
    const start = Date.now();
    const { tsservers, totalDiagnostics, componentsCount } = await this.runDiagnosticOnTsServer(
      false,
      pattern,
      effectiveUnmodified
    );
    if (!tsservers.length) {
      const data = chalk.bold(`no components found to check.
use "--unmodified" flag to check all components or specify the ids to check.
otherwise, only new and modified components will be checked`);
      return { code: 0, data };
    }
    try {
      const elapsed = (Date.now() - start) / 1000;
      const msg = `completed type checking ${componentsCount} component(s) (${elapsed} sec)`;
      const hasErrors = totalDiagnostics > 0;
      return {
        code: hasErrors && strict ? 1 : 0,
        data: hasErrors
          ? chalk.red(`${msg}. found errors in ${totalDiagnostics} files.`)
          : chalk.green(`${msg}. no errors were found.`),
      };
    } finally {
      this.typescript.killTsservers(tsservers);
    }
  }

  async json(
    [pattern]: [string],
    { all = false, unmodified = false, strict = false }: { all: boolean; unmodified: boolean; strict: boolean }
  ) {
    const effectiveUnmodified = this.handleDeprecatedAllFlag(all, unmodified);
    const { tsservers, diagnosticData, totalDiagnostics } = await this.runDiagnosticOnTsServer(
      true,
      pattern,
      effectiveUnmodified
    );
    if (!tsservers.length) {
      return { code: 0, data: [] };
    }
    try {
      return {
        code: totalDiagnostics > 0 && strict ? 1 : 0,
        data: diagnosticData,
      };
    } finally {
      this.typescript.killTsservers(tsservers);
    }
  }

  private handleDeprecatedAllFlag(all: boolean, unmodified: boolean): boolean {
    if (all) {
      this.logger.consoleWarning(`--all is deprecated, use --unmodified instead`);
      return true;
    }
    return unmodified;
  }

  private async runDiagnosticOnTsServer(
    isJson: boolean,
    pattern: string,
    unmodified: boolean
  ): Promise<{
    tsservers: TsserverClient[];
    diagnosticData: DiagnosticData[];
    totalDiagnostics: number;
    componentsCount: number;
  }> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    // If pattern is provided, don't pass the unmodified flag - the pattern should take precedence
    const components = await this.workspace.getComponentsByUserInput(pattern ? false : unmodified, pattern);
    if (!components.length) {
      return { tsservers: [], diagnosticData: [], totalDiagnostics: 0, componentsCount: 0 };
    }

    const { tsservers, diagnosticData, totalDiagnostics } = await this.typescript.checkTypesPerEnvironment(components, {
      aggregateDiagnosticData: isJson,
      printTypeErrors: !isJson,
    });

    return { tsservers, diagnosticData, totalDiagnostics, componentsCount: components.length };
  }
}
