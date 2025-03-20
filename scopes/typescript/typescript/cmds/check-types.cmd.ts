import { Command, CommandOptions } from '@teambit/cli';
import { Logger } from '@teambit/logger';
import { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import chalk from 'chalk';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import { TypescriptMain } from '../typescript.main.runtime';

export class CheckTypesCmd implements Command {
  name = 'check-types [component-pattern]';
  description = 'check typescript types';
  arguments = [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }];
  alias = '';
  group = 'development';
  options = [
    ['a', 'all', 'check-types for all components, not only modified and new'],
    ['', 'strict', 'in case issues found, exit with code 1'],
    ['j', 'json', 'return the output in json format'],
  ] as CommandOptions;

  constructor(
    private typescript: TypescriptMain,
    private workspace: Workspace,
    private logger: Logger
  ) {}

  async report([pattern]: [string], { all = false, strict = false }: { all: boolean; strict: boolean }) {
    const start = Date.now();
    const tsserver = await this.runDiagnosticOnTsServer(false, pattern, all);
    const end = Date.now() - start;
    const msg = `completed type checking (${end / 1000} sec)`;
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

  async json([pattern]: [string], { all = false, strict = false }: { all: boolean; strict: boolean }) {
    const tsserver = await this.runDiagnosticOnTsServer(true, pattern, all);
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

  private async runDiagnosticOnTsServer(isJson: boolean, pattern: string, all: boolean) {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const components = await this.workspace.getComponentsByUserInput(all, pattern);
    const files = this.typescript.getSupportedFilesForTsserver(components);
    await this.typescript.initTsserverClientFromWorkspace({
      aggregateDiagnosticData: isJson,
      printTypeErrors: !isJson
    }, files);
    const tsserver = this.typescript.getTsserverClient();
    if (!tsserver) throw new Error(`unable to start tsserver`);
    await tsserver.getDiagnostic(files);
    return tsserver;
  }
}
