import fs from 'fs-extra';
import { Logger } from '@teambit/logger';
import path from 'path';
import type ts from 'typescript/lib/tsserverlibrary';
import { CheckTypes } from '@teambit/watcher';
import type { Position } from 'vscode-languageserver-types';
import commandExists from 'command-exists';
import { findPathToModule } from './modules-resolver';
import { ProcessBasedTsServer } from './process-based-tsserver';
import { CommandTypes, EventName } from './tsp-command-types';
import { getTsserverExecutable } from './utils';
import { formatDiagnostic, Diagnostic } from './format-diagnostics';

export type TsserverClientOpts = {
  verbose?: boolean; // print tsserver events to the console.
  tsServerPath?: string; // if not provided, it'll use findTsserverPath() strategies.
  checkTypes?: CheckTypes; // whether errors/warnings are monitored and printed to the console.
  printTypeErrors?: boolean; // whether print typescript errors to the console.
  aggregateDiagnosticData?: boolean; // whether to aggregate diagnostic data instead of printing them to the console.
};

export type DiagnosticData = {
  file: string;
  diagnostic: Diagnostic;
  formatted: string;
}

export class TsserverClient {
  private tsServer: ProcessBasedTsServer | null;
  public lastDiagnostics: ts.server.protocol.DiagnosticEventBody[] = [];
  private serverRunning = false;
  public diagnosticData: DiagnosticData[] = [];
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
  async init(): Promise<void> {
    try {
      this.tsServer = new ProcessBasedTsServer({
        logger: this.logger,
        tsserverPath: this.findTsserverPath(),
        logToConsole: this.options.verbose,
        onEvent: this.onTsserverEvent.bind(this),
      });

      this.tsServer
        .start()
        .then(() => {
          this.serverRunning = true;
        })
        .catch((err) => {
          this.logger.error('TsserverClient.init failed', err);
        });

      if (this.files.length) {
        const openPromises = this.files.map((file) => this.open(file));
        await Promise.all(openPromises.map((promise) => promise.catch((error) => error)));
        const failedFiles = openPromises.filter((promise) => promise instanceof Error);
        if (failedFiles.length > 0) {
          this.logger.error('TsserverClient.init failed to open files:', failedFiles);
        }
        if (failedFiles.length > 0) {
          this.logger.error('TsserverClient.init failed to open files:', failedFiles);
        }
        this.checkTypesIfNeeded();
      }
      this.logger.debug('TsserverClient.init completed');
    } catch (err) {
      this.logger.error('TsserverClient.init failed', err);
    }
  }

  private checkTypesIfNeeded(files = this.files) {
    if (!this.shouldCheckTypes()) {
      return;
    }
    const start = Date.now();
    this.getDiagnostic(files)
      .then(() => {
        const end = Date.now() - start;
        const msg = `completed type checking (${end / 1000} sec)`;
        if (this.lastDiagnostics.length) {
          this.logger.consoleFailure(`${msg}. found errors in ${this.lastDiagnostics.length} files.`);
        } else {
          this.logger.consoleSuccess(`${msg}. no errors were found.`);
        }
      })
      .catch((err) => {
        const msg = `failed getting the type errors from ts-server`;
        this.logger.console(msg);
        this.logger.error(msg, err);
      });
  }

  private shouldCheckTypes() {
    // this also covers this.options.checkTypes !== CheckTypes.None.
    return Boolean(this.options.checkTypes);
  }

  /**
   * if `bit watch` or `bit start` are running in the background, this method is triggered.
   */
  async onFileChange(file: string) {
    await this.changed(file);
    const files = this.options.checkTypes === CheckTypes.ChangedFile ? [file] : undefined;
    this.checkTypesIfNeeded(files);
  }

  killTsServer() {
    if (this.tsServer && this.serverRunning) {
      this.tsServer.kill();
      this.tsServer = null;
      this.serverRunning = false;
    }
  }

  isServerRunning() {
    return this.serverRunning;
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
  async getDiagnostic(files = this.files): Promise<any> {
    this.lastDiagnostics = [];
    return this.tsServer?.request(CommandTypes.Geterr, { delay: 0, files });
  }

  /**
   * avoid using this method, it takes longer than `getDiagnostic()` and shows errors from paths outside the project
   */
  async getDiagnosticAllProject(requestedByFile: string): Promise<any> {
    return this.tsServer?.request(CommandTypes.GeterrForProject, { file: requestedByFile, delay: 0 });
  }

  /**
   * @param file can be absolute or relative to this.projectRoot.
   */
  async getQuickInfo(file: string, position: Position): Promise<ts.server.protocol.QuickInfoResponse | undefined> {
    const absFile = this.convertFileToAbsoluteIfNeeded(file);
    await this.openIfNeeded(absFile);
    return this.tsServer?.request(CommandTypes.Quickinfo, {
      file: absFile,
      line: position.line,
      offset: position.character,
    });
  }

  /**
   * @param file can be absolute or relative to this.projectRoot.
   */
  async getTypeDefinition(
    file: string,
    position: Position
  ): Promise<ts.server.protocol.TypeDefinitionResponse | undefined> {
    const absFile = this.convertFileToAbsoluteIfNeeded(file);
    await this.openIfNeeded(absFile);
    return this.tsServer?.request(CommandTypes.TypeDefinition, {
      file: absFile,
      line: position.line,
      offset: position.character,
    });
  }

  async getDefinition(file: string, position: Position) {
    const absFile = this.convertFileToAbsoluteIfNeeded(file);
    await this.openIfNeeded(absFile);
    const response = await this.tsServer?.request(CommandTypes.Definition, {
      file: absFile,
      line: position.line,
      offset: position.character,
    });

    if (!response?.success) {
      // TODO: we need a function to handle responses properly here for all.
      this.logger.warn(`For file ${absFile} tsserver failed to request definition info`);
      return response;
    }

    return response;
  }

  /**
   * @param file can be absolute or relative to this.projectRoot.
   */
  async getReferences(file: string, position: Position): Promise<ts.server.protocol.ReferencesResponse | undefined> {
    const absFile = this.convertFileToAbsoluteIfNeeded(file);
    await this.openIfNeeded(absFile);
    return this.tsServer?.request(CommandTypes.References, {
      file: absFile,
      line: position.line,
      offset: position.character,
    });
  }

  /**
   * @param file can be absolute or relative to this.projectRoot.
   */
  async getSignatureHelp(
    file: string,
    position: Position
  ): Promise<ts.server.protocol.SignatureHelpResponse | undefined> {
    const absFile = this.convertFileToAbsoluteIfNeeded(file);
    await this.openIfNeeded(absFile);

    return this.tsServer?.request(CommandTypes.SignatureHelp, {
      file: absFile,
      line: position.line,
      offset: position.character,
    });
  }

  private async configure(
    configureArgs: ts.server.protocol.ConfigureRequestArguments = {}
  ): Promise<ts.server.protocol.ConfigureResponse | undefined> {
    return this.tsServer?.request(CommandTypes.Configure, configureArgs);
  }

  /**
   * ask tsserver to open a file if it was not opened before.
   * @param file absolute path of the file
   */
  async openIfNeeded(file: string) {
    if (this.files.includes(file)) {
      return;
    }
    await this.open(file);
    this.files.push(file);
  }

  private async open(file: string) {
    return this.tsServer?.notify(CommandTypes.Open, {
      file,
      projectRootPath: this.projectPath,
    });
  }

  async close(file: string) {
    await this.tsServer?.notify(CommandTypes.Close, {
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
    await this.tsServer?.notify(CommandTypes.Change, {
      file,
      line: 1,
      offset: 1,
      endLine: 99999,
      endOffset: 1,
      insertString: '',
    });

    const content = await fs.readFile(file, 'utf-8');

    // tell tsserver that all file content was added
    await this.tsServer?.notify(CommandTypes.Change, {
      file,
      line: 1,
      offset: 1,
      endLine: 1,
      endOffset: 1,
      insertString: content,
    });
  }

  protected onTsserverEvent(event: ts.server.protocol.Event): void {
    switch (event.event) {
      case EventName.semanticDiag:
      case EventName.syntaxDiag:
        this.publishDiagnostic(event as ts.server.protocol.DiagnosticEvent);
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

  private publishDiagnostic(message: ts.server.protocol.DiagnosticEvent) {
    if (!message.body?.diagnostics.length || (!this.options.printTypeErrors && !this.options.aggregateDiagnosticData)) {
      return;
    }
    this.lastDiagnostics.push(message.body);
    const file = path.relative(this.projectPath, message.body.file);
    message.body.diagnostics.forEach((diag) => {
      const formatted = formatDiagnostic(diag, file);
      if (this.options.printTypeErrors) {
        this.logger.console(formatted);
      }
      if (this.options.aggregateDiagnosticData) {
        this.diagnosticData.push({
          file,
          diagnostic: diag,
          formatted,
        });
      }
    });
  }

  /**
   * copied over from https://github.com/typescript-language-server/typescript-language-server/blob/master/src/lsp-server.ts
   */
  private findTsserverPath(): string {
    if (this.options.tsServerPath) {
      return this.options.tsServerPath;
    }

    const tsServerPath = path.join('typescript', 'lib', 'tsserver.js');

    /**
     * (1) find it in the bit directory
     */
    const bundled = findPathToModule(__dirname, tsServerPath);

    if (bundled) {
      return bundled;
    }

    // (2) use globally installed tsserver
    if (commandExists.sync(getTsserverExecutable())) {
      return getTsserverExecutable();
    }

    throw new Error(`Couldn't find '${getTsserverExecutable()}' executable or 'tsserver.js' module`);
  }
}
