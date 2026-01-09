import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { OutsideWorkspaceError } from '@teambit/workspace';
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
    if (all) {
      unmodified = all;
      this.logger.consoleWarning(`--all is deprecated, use --unmodified instead`);
    }
    const start = Date.now();
    const { tsserver, componentsCount } = await this.runDiagnosticOnTsServer(false, pattern, unmodified);
    if (!tsserver) {
      const data = chalk.bold(`no components found to check.
use "--unmodified" flag to check all components or specify the ids to check.
otherwise, only new and modified components will be checked`);
      return { code: 0, data };
    }
    const end = Date.now() - start;
    const msg = `completed type checking ${componentsCount} component(s) (${end / 1000} sec)`;
    tsserver.killTsServer();
    if (tsserver.lastDiagnostics.length) {
      return {
        code: strict ? 1 : 0,
        data: chalk.red(`${msg}. found errors in ${tsserver.lastDiagnostics.length} files.`),
      };
    }
    return {
      code: 0,
      data: chalk.green(`${msg}. no errors were found.`),
    };
  }

  async json(
    [pattern]: [string],
    { all = false, unmodified = false, strict = false }: { all: boolean; unmodified: boolean; strict: boolean }
  ) {
    if (all) {
      unmodified = all;
      this.logger.consoleWarning(`--all is deprecated, use --unmodified instead`);
    }
    const { tsserver } = await this.runDiagnosticOnTsServer(true, pattern, unmodified);
    if (!tsserver) {
      return { code: 0, data: [] };
    }
    const diagData = tsserver.diagnosticData;
    tsserver.killTsServer();
    if (tsserver.lastDiagnostics.length) {
      return {
        code: strict ? 1 : 0,
        data: diagData,
      };
    }
    return {
      code: 0,
      data: diagData,
    };
  }

  private async runDiagnosticOnTsServer(
    isJson: boolean,
    pattern: string,
    unmodified: boolean
  ): Promise<{ tsserver: ReturnType<TypescriptMain['getTsserverClient']>; componentsCount: number }> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    // If pattern is provided, don't pass the unmodified flag - the pattern should take precedence
    const components = await this.workspace.getComponentsByUserInput(pattern ? false : unmodified, pattern);
    if (!components.length) {
      return { tsserver: undefined, componentsCount: 0 };
    }
    const files = this.typescript.getSupportedFilesForTsserver(components);
    await this.typescript.initTsserverClientFromWorkspace(
      {
        aggregateDiagnosticData: isJson,
        printTypeErrors: !isJson,
      },
      files
    );
    const tsserver = this.typescript.getTsserverClient();
    if (!tsserver) throw new Error(`unable to start tsserver`);
    await tsserver.getDiagnostic(files);
    return { tsserver, componentsCount: components.length };
  }
}
