import fs from 'fs-extra';
import { Logger } from '@teambit/logger';
import path from 'path';
// eslint-disable-next-line import/no-unresolved
import protocol from 'typescript/lib/protocol';
import { Position } from 'vscode-languageserver-types';
import commandExists from 'command-exists';
import { findPathToModule, findPathToYarnSdk } from './modules-resolver';
import { ProcessBasedTsServer } from './process-based-tsserver';
import { CommandTypes, EventName } from './tsp-command-types';
import { getTsserverExecutable } from './utils';
import { formatDiagnostics } from './format-diagnostics';

export type TsserverClientOpts = {
  verbose?: boolean; // print tsserver events to the console.
  tsServerPath?: string; // if not provided, it'll use findTsserverPath() strategies.
  checkTypes?: boolean; // whether errors/warnings are monitored and printed to the console.
};

export class TsserverClient {
  private tsServer: ProcessBasedTsServer;
  constructor(
    /**
     * absolute root path of the project.
     */
    private projectPath: string,
    private logger: Logger,
    private options: TsserverClientOpts = {},
    /**
     * provide files if you want to check types on init. (options.checkTypes should be enabled).
     * paths should be absolute.
     */
    private files: string[] = []
  ) {}

  /**
   * start the ts-server and keep its process alive.
   * this methods returns pretty fast. if checkTypes is enabled, it runs the process in the background and
   * doesn't wait for it.
   */
  init() {
    this.tsServer = new ProcessBasedTsServer({
      logger: this.logger,
      tsserverPath: this.findTsserverPath(),
      logToConsole: this.options.verbose,
      onEvent: this.onTsserverEvent.bind(this),
    });
    this.tsServer.start();
    if (this.files.length) {
      this.files.forEach((file) => this.open(file));
    }
    if (this.options.checkTypes) {
      const start = Date.now();
      this.getDiagnostic()
        .then(() => {
          const end = Date.now() - start;
          this.logger.console(`\ncompleted preliminary type checking (${end / 1000} sec)`);
        })
        .catch((err) => {
          const msg = `failed getting the type errors from ts-server`;
          this.logger.console(msg);
          this.logger.error(msg, err);
        });
    }
    this.logger.debug('TsserverClient.init completed');
  }

  /**
   * if `bit watch` or `bit start` are running in the background, this method is triggered.
   */
  async onFileChange(file: string) {
    await this.changed(file);
    if (this.options.checkTypes) {
      const start = Date.now();
      this.getDiagnostic()
        .then(() => {
          const end = Date.now() - start;
          this.logger.console(`\ntype checking had been completed (${end / 1000} sec) for "${file}"`);
        })
        .catch((err) => {
          const msg = `failed getting the type errors from ts-server for "${file}"`;
          this.logger.console(msg);
          this.logger.error(msg, err);
        });
    }
  }

  killTsServer() {
    this.tsServer.kill();
  }

  /**
   * get diagnostic of all files opened in the project.
   * there is little to no value of getting diagnostic for a specific file, as
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

  /**
   * avoid using this method, it takes longer than `getDiagnostic()` and shows errors from paths outside the project
   */
  async getDiagnosticAllProject(requestedByFile: string): Promise<any> {
    return this.tsServer.request(CommandTypes.GeterrForProject, { file: requestedByFile, delay: 0 });
  }

  /**
   * @param file can be absolute or relative to this.projectRoot.
   */
  async getQuickInfo(file: string, position: Position): Promise<protocol.QuickInfoResponse | undefined> {
    const absFile = this.convertFileToAbsoluteIfNeeded(file);
    this.openIfNeeded(absFile);
    return this.tsServer.request(CommandTypes.Quickinfo, {
      file: absFile,
      line: position.line,
      offset: position.character,
    });
  }

  /**
   * @param file can be absolute or relative to this.projectRoot.
   */
  async getTypeDefinition(file: string, position: Position): Promise<protocol.TypeDefinitionResponse | undefined> {
    const absFile = this.convertFileToAbsoluteIfNeeded(file);
    this.openIfNeeded(absFile);
    return this.tsServer.request(CommandTypes.TypeDefinition, {
      file: absFile,
      line: position.line,
      offset: position.character,
    });
  }

  /**
   * @param file can be absolute or relative to this.projectRoot.
   */
  async getReferences(file: string, position: Position): Promise<protocol.ReferencesResponse | undefined> {
    const absFile = this.convertFileToAbsoluteIfNeeded(file);
    this.openIfNeeded(absFile);
    return this.tsServer.request(CommandTypes.References, {
      file: absFile,
      line: position.line,
      offset: position.character,
    });
  }

  /**
   * @param file can be absolute or relative to this.projectRoot.
   */
  async getSignatureHelp(file: string, position: Position): Promise<protocol.SignatureHelpResponse | undefined> {
    const absFile = this.convertFileToAbsoluteIfNeeded(file);
    this.openIfNeeded(absFile);
    return this.tsServer.request(CommandTypes.SignatureHelp, {
      file: absFile,
      line: position.line,
      offset: position.character,
    });
  }

  private async configure(
    configureArgs: protocol.ConfigureRequestArguments = {}
  ): Promise<protocol.ConfigureResponse | undefined> {
    return this.tsServer.request(CommandTypes.Configure, configureArgs);
  }

  /**
   * ask tsserver to open a file if it was not opened before.
   * @param file absolute path of the file
   */
  openIfNeeded(file: string) {
    if (this.files.includes(file)) {
      return;
    }
    this.open(file);
    this.files.push(file);
  }

  private open(file: string) {
    this.tsServer.notify(CommandTypes.Open, {
      file,
      projectRootPath: this.projectPath,
    });
  }

  close(file: string) {
    this.tsServer.notify(CommandTypes.Close, {
      file,
    });
    this.files = this.files.filter((openFile) => openFile !== file);
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
        this.publishDiagnostic(event as protocol.DiagnosticEvent);
        break;
      default:
        this.logger.debug(`ignored TsServer event: ${event.event}`);
    }
  }

  private convertFileToAbsoluteIfNeeded(filepath: string): string {
    if (path.isAbsolute(filepath)) {
      return filepath;
    }
    return path.join(this.projectPath, filepath);
  }

  private publishDiagnostic(message: protocol.DiagnosticEvent) {
    if (!message.body?.diagnostics.length || !this.options.checkTypes) {
      return;
    }
    const file = path.relative(this.projectPath, message.body.file);
    const errorMsg = formatDiagnostics(message.body.diagnostics, file);
    this.logger.console(errorMsg);
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
