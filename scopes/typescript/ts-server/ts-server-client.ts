import { Logger } from '@teambit/logger';
import path from 'path';
// eslint-disable-next-line import/no-unresolved
import protocol from 'typescript/lib/protocol';
import { Position } from 'vscode-languageserver-types';
import commandExists from 'command-exists';
import { findPathToModule, findPathToYarnSdk } from './modules-resolver';
import { ProcessBasedTsServer } from './process-based-tsserver';
import { CommandTypes } from './tsp-command-types';
import { getTsserverExecutable } from './utils';

type TsserverClientOpts = {
  logger: Logger;
  verbose?: boolean;
  tsServerPath?: string; // if not provided, it'll use findTsserverPath() strategies
};

export class TsserverClient {
  private tsServer: ProcessBasedTsServer;

  constructor(private projectPath: string, private options: TsserverClientOpts) {}
  init() {
    this.tsServer = new ProcessBasedTsServer({
      logger: this.options.logger,
      tsserverPath: this.findTsserverPath(),
      logToConsole: this.options.verbose,
    });
    this.tsServer.start();
  }

  async getQuickInfo(file: string, position: Position): Promise<protocol.QuickInfoResponse | undefined> {
    return this.tsServer.request(CommandTypes.Quickinfo, {
      file,
      line: position.line + 1,
      offset: position.character + 1,
    });
  }

  async configure(
    configureArgs: protocol.ConfigureRequestArguments = {}
  ): Promise<protocol.ConfigureResponse | undefined> {
    return this.tsServer.request(CommandTypes.Configure, configureArgs);
  }

  // async compilerOpt() {
  //     await this.tsServer.request(CommandTypes.CompilerOptionsForInferredProjects, {
  //         options: {
  //             module: 'CommonJS',
  //             target: 'ES2016',
  //             jsx: 'Preserve',
  //             allowJs: true,
  //             allowSyntheticDefaultImports: true,
  //             allowNonTsExtensions: true
  //         }
  //     });
  // }

  async open(file: string) {
    this.tsServer.notify(CommandTypes.Open, {
      file,
      projectRootPath: this.projectPath,
    });
  }

  async getDiag(files: string[]) {
    return this.tsServer.request(CommandTypes.Geterr, { delay: 0, files });
  }

  /**
   * copied over from https://github.com/typescript-language-server/typescript-language-server/blob/master/src/lsp-server.ts
   */
  private findTsserverPath(): string {
    if (this.options.tsServerPath) {
      return this.options.tsServerPath;
    }
    const tsServerPath = path.join('typescript', 'lib', 'tsserver.js');
    // 1) look into .yarn/sdks of workspace root
    const sdk = findPathToYarnSdk(this.projectPath, tsServerPath);
    if (sdk) {
      return sdk;
    }
    // 2) look into node_modules of workspace root
    const executable = findPathToModule(this.projectPath, tsServerPath);
    if (executable) {
      return executable;
    }
    // 3) use globally installed tsserver
    if (commandExists.sync(getTsserverExecutable())) {
      return getTsserverExecutable();
    }
    // 4) look into node_modules of typescript-language-server
    const bundled = findPathToModule(__dirname, tsServerPath);
    if (bundled) {
      return bundled;
    }
    throw new Error(`Couldn't find '${getTsserverExecutable()}' executable or 'tsserver.js' module`);
  }
}
