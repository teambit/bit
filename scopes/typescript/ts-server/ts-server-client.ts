import fs from 'fs-extra';
import { Logger } from '@teambit/logger';
import path from 'path';
// eslint-disable-next-line import/no-unresolved
import protocol from 'typescript/lib/protocol';
import { Position } from 'vscode-languageserver-types';
import commandExists from 'command-exists';
import { findPathToModule, findPathToYarnSdk } from './modules-resolver';
import { ProcessBasedTsServer, TypeScriptRequestTypes } from './process-based-tsserver';
import { CommandTypes, EventName } from './tsp-command-types';
import { getTsserverExecutable } from './utils';

type TsserverClientOpts = {
  logger: Logger;
  verbose?: boolean;
  tsServerPath?: string; // if not provided, it'll use findTsserverPath() strategies
};

export class TsserverClient {
  private tsServer: ProcessBasedTsServer;
  private logger: Logger;
  constructor(private projectPath: string, private files: string[], private options: TsserverClientOpts) {
    this.logger = this.options.logger;
  }
  /**
   * start the ts-server and keep its process alive.
   * the initial process should be pretty quick as it doesn't open or investigate the project files.
   */
  init() {
    this.tsServer = new ProcessBasedTsServer({
      logger: this.options.logger,
      tsserverPath: this.findTsserverPath(),
      logToConsole: this.options.verbose,
      onEvent: this.onTsserverEvent.bind(this),
    });
    this.tsServer.start();
  }

  /**
   * get diagnostic of the entire project. there is little to no value of getting diagnostic for a specific file, as
   * changing a type in one file may cause errors in different files.
   *
   * the errors/diagnostic info are sent as events, see this.onTsserverEvent() for more info.
   *
   * the return value here just shows whether the request was succeeded, it doesn't have any info about whether errors
   * were found or not.
   */
  async getDiagnostic(): Promise<any> {
    return this.tsServer.request(CommandTypes.Geterr, { delay: 0, files: this.files });
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

  open(file: string) {
    this.tsServer.notify(CommandTypes.Open, {
      file,
      projectRootPath: this.projectPath,
    });
  }

  openAllFiles() {
    this.files.forEach((file) => this.open(file));
  }

  close(file: string) {
    this.tsServer.notify(CommandTypes.Close, {
      file,
    });
  }

  /**
   * since Bit is not an IDE, it doesn't have the information such as the exact line/offset of the changes.
   * as a workaround, to tell tsserver what was changed, we pretend that the entire file was cleared and new text was
   * added. this is the only way I could find to tell tsserver about the change. otherwise, tsserver keep assuming that
   * the file content remained the same. (closing/re-opening the file doesn't help).
   */
  async changed(file: string) {
    // tell tsserver that all content was removed
    this.tsServer.notify(CommandTypes.Change, {
      file,
      line: 1,
      offset: 1,
      endLine: 99999,
      endOffset: 1,
      insertString: '',
    });

    const content = await fs.readFile(file, 'utf-8');

    // tell tsserver that all file content was added
    this.tsServer.notify(CommandTypes.Change, {
      file,
      line: 1,
      offset: 1,
      endLine: 1,
      endOffset: 1,
      insertString: content,
    });
  }

  protected onTsserverEvent(event: protocol.Event): void {
    switch (event.event) {
      case EventName.semanticDiag:
      case EventName.syntaxDiag:
      case EventName.suggestionDiag:
        this.publishDiagnostic(event as protocol.DiagnosticEvent);
        break;
      default:
        this.logger.debug(`ignored TsServer event: ${event.event}`);
    }
  }

  private publishDiagnostic(message: protocol.DiagnosticEvent) {
    if (!message.body?.diagnostics.length) {
      return;
    }
    const errors = message.body.diagnostics.map((d) => `code: ${d.code}, text: ${d.text}`).join('\n');
    const errorMsg = `Found errors in file: ${message.body.file}\n${errors}\n`;
    this.options.logger.console(errorMsg);
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
