/**
 * part of this file was copied over from https://github.com/typescript-language-server/typescript-language-server/blob/master/src/tsp-client.ts
 */

/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as readline from 'readline';
import { Logger } from '@teambit/logger';
import { Readable, Writable } from 'stream';
import * as decoder from 'string_decoder';
import type ts from 'typescript/lib/tsserverlibrary';
import tempy from 'tempy';
import { CancellationToken } from 'vscode-jsonrpc';
import { CommandTypes } from './tsp-command-types';
import { Deferred } from './utils';

export interface TspClientOptions {
  logger: Logger;
  tsserverPath: string;
  logToConsole?: boolean;
  onEvent?: (event: ts.server.protocol.Event) => void;
}

export interface TsServerArgs {
  logFile?: string;
  logVerbosity?: string;
  maxTsServerMemory?: number;
  globalPlugins?: string[];
  pluginProbeLocations?: string[];
}

export interface StandardTsServerRequests {
  [CommandTypes.ApplyCodeActionCommand]: [
    ts.server.protocol.ApplyCodeActionCommandRequestArgs,
    ts.server.protocol.ApplyCodeActionCommandResponse,
  ];
  [CommandTypes.CompletionDetails]: [
    ts.server.protocol.CompletionDetailsRequestArgs,
    ts.server.protocol.CompletionDetailsResponse,
  ];
  [CommandTypes.CompletionInfo]: [ts.server.protocol.CompletionsRequestArgs, ts.server.protocol.CompletionInfoResponse];
  [CommandTypes.Configure]: [ts.server.protocol.ConfigureRequestArguments, ts.server.protocol.ConfigureResponse];
  [CommandTypes.Definition]: [ts.server.protocol.FileLocationRequestArgs, ts.server.protocol.DefinitionResponse];
  [CommandTypes.DefinitionAndBoundSpan]: [
    ts.server.protocol.FileLocationRequestArgs,
    ts.server.protocol.DefinitionInfoAndBoundSpanResponse,
  ];
  [CommandTypes.DocCommentTemplate]: [
    ts.server.protocol.FileLocationRequestArgs,
    ts.server.protocol.DocCommandTemplateResponse,
  ];
  [CommandTypes.DocumentHighlights]: [
    ts.server.protocol.DocumentHighlightsRequestArgs,
    ts.server.protocol.DocumentHighlightsResponse,
  ];
  [CommandTypes.Format]: [ts.server.protocol.FormatRequestArgs, ts.server.protocol.FormatResponse];
  [CommandTypes.Formatonkey]: [ts.server.protocol.FormatOnKeyRequestArgs, ts.server.protocol.FormatResponse];
  [CommandTypes.GetApplicableRefactors]: [
    ts.server.protocol.GetApplicableRefactorsRequestArgs,
    ts.server.protocol.GetApplicableRefactorsResponse,
  ];
  [CommandTypes.GetCodeFixes]: [ts.server.protocol.CodeFixRequestArgs, ts.server.protocol.CodeFixResponse];
  [CommandTypes.GetCombinedCodeFix]: [
    ts.server.protocol.GetCombinedCodeFixRequestArgs,
    ts.server.protocol.GetCombinedCodeFixResponse,
  ];
  [CommandTypes.GetEditsForFileRename]: [
    ts.server.protocol.GetEditsForFileRenameRequestArgs,
    ts.server.protocol.GetEditsForFileRenameResponse,
  ];
  [CommandTypes.GetEditsForRefactor]: [
    ts.server.protocol.GetEditsForRefactorRequestArgs,
    ts.server.protocol.GetEditsForRefactorResponse,
  ];
  [CommandTypes.GetOutliningSpans]: [ts.server.protocol.FileRequestArgs, ts.server.protocol.OutliningSpansResponse];
  [CommandTypes.GetSupportedCodeFixes]: [null, ts.server.protocol.GetSupportedCodeFixesResponse];
  [CommandTypes.Implementation]: [
    ts.server.protocol.FileLocationRequestArgs,
    ts.server.protocol.ImplementationResponse,
  ];
  [CommandTypes.JsxClosingTag]: [ts.server.protocol.JsxClosingTagRequestArgs, ts.server.protocol.JsxClosingTagResponse];
  [CommandTypes.Navto]: [ts.server.protocol.NavtoRequestArgs, ts.server.protocol.NavtoResponse];
  [CommandTypes.NavTree]: [ts.server.protocol.FileRequestArgs, ts.server.protocol.NavTreeResponse];
  [CommandTypes.OrganizeImports]: [
    ts.server.protocol.OrganizeImportsRequestArgs,
    ts.server.protocol.OrganizeImportsResponse,
  ];
  [CommandTypes.PrepareCallHierarchy]: [
    ts.server.protocol.FileLocationRequestArgs,
    ts.server.protocol.PrepareCallHierarchyResponse,
  ];
  [CommandTypes.ProvideCallHierarchyIncomingCalls]: [
    ts.server.protocol.FileLocationRequestArgs,
    ts.server.protocol.ProvideCallHierarchyIncomingCallsResponse,
  ];
  [CommandTypes.ProvideCallHierarchyOutgoingCalls]: [
    ts.server.protocol.FileLocationRequestArgs,
    ts.server.protocol.ProvideCallHierarchyOutgoingCallsResponse,
  ];
  [CommandTypes.ProjectInfo]: [ts.server.protocol.ProjectInfoRequestArgs, ts.server.protocol.ProjectInfoResponse];
  [CommandTypes.ProvideInlayHints]: [ts.server.protocol.InlayHintsRequestArgs, ts.server.protocol.InlayHintsResponse];
  [CommandTypes.Quickinfo]: [ts.server.protocol.FileLocationRequestArgs, ts.server.protocol.QuickInfoResponse];
  [CommandTypes.References]: [ts.server.protocol.FileLocationRequestArgs, ts.server.protocol.ReferencesResponse];
  [CommandTypes.Rename]: [ts.server.protocol.RenameRequestArgs, ts.server.protocol.RenameResponse];
  [CommandTypes.SelectionRange]: [
    ts.server.protocol.SelectionRangeRequestArgs,
    ts.server.protocol.SelectionRangeResponse,
  ];
  [CommandTypes.SignatureHelp]: [ts.server.protocol.SignatureHelpRequestArgs, ts.server.protocol.SignatureHelpResponse];
  [CommandTypes.TypeDefinition]: [
    ts.server.protocol.FileLocationRequestArgs,
    ts.server.protocol.TypeDefinitionResponse,
  ];
  [CommandTypes.UpdateOpen]: [ts.server.protocol.UpdateOpenRequestArgs, ts.server.protocol.Response];
}

export interface NoResponseTsServerRequests {
  [CommandTypes.Change]: [ts.server.protocol.ChangeRequestArgs, null];
  [CommandTypes.Close]: [ts.server.protocol.FileRequestArgs, null];
  [CommandTypes.CompilerOptionsForInferredProjects]: [
    ts.server.protocol.SetCompilerOptionsForInferredProjectsArgs,
    ts.server.protocol.SetCompilerOptionsForInferredProjectsResponse,
  ];
  [CommandTypes.Configure]: [ts.server.protocol.ConfigureRequestArguments, ts.server.protocol.ConfigureResponse];
  [CommandTypes.ConfigurePlugin]: [
    ts.server.protocol.ConfigurePluginRequestArguments,
    ts.server.protocol.ConfigurePluginResponse,
  ];
  [CommandTypes.Open]: [ts.server.protocol.OpenRequestArgs, null];
}

export interface AsyncTsServerRequests {
  [CommandTypes.Geterr]: [ts.server.protocol.GeterrRequestArgs, ts.server.protocol.Response];
  [CommandTypes.GeterrForProject]: [ts.server.protocol.GeterrForProjectRequestArgs, ts.server.protocol.Response];
}

export type TypeScriptRequestTypes = StandardTsServerRequests & NoResponseTsServerRequests & AsyncTsServerRequests;

export class ProcessBasedTsServer {
  private readlineInterface: readline.ReadLine | null;
  private tsServerProcess: cp.ChildProcess | null;
  private seq = 0;

  private readonly deferreds: {
    [seq: number]: Deferred<any>;
  } = {};

  private logger: Logger;
  private cancellationPipeName: string | undefined;
  private memoryMonitorInterval: NodeJS.Timeout | null = null;

  constructor(
    private options: TspClientOptions,
    private tsServerArgs: TsServerArgs = {}
  ) {
    this.logger = options.logger;
  }

  private startMemoryMonitoring() {
    // Monitor memory usage every 30 seconds
    this.memoryMonitorInterval = setInterval(() => {
      if (this.tsServerProcess && this.tsServerProcess.pid) {
        const memUsage = process.memoryUsage();
        this.logger.info(
          `[TSServer Memory Monitor] Main process - RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB, External: ${Math.round(memUsage.external / 1024 / 1024)}MB`
        );

        // Try to get child process memory info (this may not always work cross-platform)
        try {
          const pid = this.tsServerProcess.pid;

          // Use ps command to get memory info for the child process
          if (process.platform === 'darwin' || process.platform === 'linux') {
            const psOutput = cp.execSync(`ps -o pid,ppid,rss,vsz,comm -p ${pid}`, { encoding: 'utf8', timeout: 1000 });
            this.logger.info(`[TSServer Memory Monitor] Child process (PID: ${pid}):\n${psOutput}`);
          } else if (process.platform === 'win32') {
            const wmicOutput = cp.execSync(
              `wmic process where ProcessId=${pid} get ProcessId,WorkingSetSize,VirtualSize,Name /format:csv`,
              { encoding: 'utf8', timeout: 1000 }
            );
            this.logger.info(`[TSServer Memory Monitor] Child process (PID: ${pid}):\n${wmicOutput}`);
          }
        } catch {
          // Silently ignore errors when getting child process memory info
          // This can happen if the process doesn't exist or we don't have permissions
        }
      }
    }, 30000);
  }

  private stopMemoryMonitoring() {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = null;
    }
  }

  async restart() {
    const memBefore = process.memoryUsage();
    this.logger.info(
      `[TSServer Memory] Before restart - RSS: ${Math.round(memBefore.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(memBefore.heapUsed / 1024 / 1024)}MB`
    );

    this.kill();
    await this.start();

    const memAfter = process.memoryUsage();
    this.logger.info(
      `[TSServer Memory] After restart - RSS: ${Math.round(memAfter.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(memAfter.heapUsed / 1024 / 1024)}MB`
    );
  }

  start() {
    return new Promise<void>((resolve, reject) => {
      if (this.tsServerProcess) {
        reject(new Error('server already started'));
        return;
      }

      const { tsserverPath } = this.options;
      const { logFile, logVerbosity, maxTsServerMemory, globalPlugins, pluginProbeLocations } = this.tsServerArgs;
      const args: string[] = [];
      if (logFile) {
        args.push('--logFile', logFile);
      }
      if (logVerbosity) {
        args.push('--logVerbosity', logVerbosity);
      }
      if (globalPlugins && globalPlugins.length) {
        args.push('--globalPlugins', globalPlugins.join(','));
      }
      if (pluginProbeLocations && pluginProbeLocations.length) {
        args.push('--pluginProbeLocations', pluginProbeLocations.join(','));
      }
      this.cancellationPipeName = tempy.file({ name: 'tscancellation' });
      args.push('--cancellationPipeName', `${this.cancellationPipeName}*`);
      this.logger.info(`Starting tsserver : '${tsserverPath} ${args.join(' ')}'`);
      const tsserverPathIsModule = path.extname(tsserverPath) === '.js';
      const options = {
        silent: true,
        execArgv: maxTsServerMemory ? [`--max-old-space-size=${maxTsServerMemory}`] : [],
      };
      this.tsServerProcess = tsserverPathIsModule ? cp.fork(tsserverPath, args, options) : cp.spawn(tsserverPath, args);

      // Log process information for debugging
      if (this.tsServerProcess.pid) {
        this.logger.info(`[TSServer Process] Started with PID: ${this.tsServerProcess.pid}, PPID: ${process.pid}`);
        this.logger.info(`[TSServer Process] Command: ${tsserverPath} ${args.join(' ')}`);
        this.logger.info(`[TSServer Process] Node options: ${JSON.stringify(options.execArgv)}`);
      }

      // Start memory monitoring
      this.startMemoryMonitoring();

      this.readlineInterface = readline.createInterface(
        this.tsServerProcess.stdout as Readable,
        this.tsServerProcess.stdin as Writable,
        undefined
      );
      // Handle various process termination scenarios
      process.on('exit', () => {
        this.logger.info('[TSServer Process] Main process exiting, killing TSServer');
        this.kill();
        reject(new Error('TSServer was killed due to main process exit'));
      });

      // Monitor the child process for termination
      this.tsServerProcess.on('exit', (code, signal) => {
        this.logger.error(
          `[TSServer Process] Child process exited with code: ${code}, signal: ${signal}, PID: ${this.tsServerProcess?.pid}`
        );
        this.stopMemoryMonitoring();
        if (signal === 'SIGKILL') {
          this.logger.error('[TSServer Process] Process was killed (likely OOM)');
        }
      });

      this.tsServerProcess.on('error', (error) => {
        this.logger.error(
          `[TSServer Process] Child process error: ${error.message}, PID: ${this.tsServerProcess?.pid}`
        );
        this.stopMemoryMonitoring();
      });

      this.readlineInterface.on('line', (line) => {
        this.processMessage(line, resolve, reject);
      });

      const dec = new decoder.StringDecoder('utf-8');
      this.tsServerProcess.stderr?.addListener('data', (data) => {
        const stringMsg = typeof data === 'string' ? data : dec.write(data);
        this.logger.error(stringMsg);
        reject(new Error(stringMsg));
      });
    });
  }

  async notify(command: CommandTypes.Open, args: ts.server.protocol.OpenRequestArgs): Promise<void>;
  async notify(command: CommandTypes.Close, args: ts.server.protocol.FileRequestArgs): Promise<void>;
  async notify(command: CommandTypes.Saveto, args: ts.server.protocol.SavetoRequestArgs): Promise<void>;
  async notify(command: CommandTypes.Change, args: ts.server.protocol.ChangeRequestArgs): Promise<void>;
  async notify(command: string, args: any): Promise<void> {
    await this.ensureServerIsRunning();
    this.sendMessage(command, true, args);
  }

  async request<K extends keyof TypeScriptRequestTypes>(
    command: K,
    args: TypeScriptRequestTypes[K][0],
    token?: CancellationToken
  ): Promise<TypeScriptRequestTypes[K][1]> {
    await this.ensureServerIsRunning();

    // Log memory usage for potentially expensive operations
    if (['navto', 'references', 'getApplicableRefactors', 'getCodeFixes'].includes(command.toLowerCase())) {
      const mem = process.memoryUsage();
      this.logger.info(
        `[TSServer Memory] Before ${command} - RSS: ${Math.round(mem.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`
      );
    }

    this.sendMessage(command, false, args);
    const seq = this.seq;
    const deferred = new Deferred<TypeScriptRequestTypes[K][1]>();
    this.deferreds[seq] = deferred;
    const request = deferred.promise;

    let onCancelled;
    if (token) {
      onCancelled = token.onCancellationRequested(() => {
        onCancelled.dispose();
        if (this.cancellationPipeName) {
          const requestCancellationPipeName = `${this.cancellationPipeName}${seq}`;
          fs.writeFile(requestCancellationPipeName, '', (err) => {
            if (!err) {
              // eslint-disable-next-line
              request.then(() =>
                fs.unlink(requestCancellationPipeName, () => {
                  /* no-op */
                })
              );
            }
          });
        }
      });
    }

    try {
      const result = await request;
      onCancelled?.dispose();
      return result;
    } catch (error) {
      this.logger.error(`Error in request: ${error}`);
      throw error;
    }
  }

  kill() {
    if (this.tsServerProcess?.pid) {
      this.logger.info(`[TSServer Process] Killing process with PID: ${this.tsServerProcess.pid}`);
    }

    this.stopMemoryMonitoring();
    this.tsServerProcess?.kill();
    this.tsServerProcess?.stdin?.destroy();
    this.readlineInterface?.close();
    this.tsServerProcess = null;
    this.readlineInterface = null;

    this.logger.info('[TSServer Process] Process cleanup completed');
  }

  private log(msg: string, obj: Record<string, any> = {}) {
    msg = `[tsserver] ${msg}`;
    if (this.options.logToConsole) {
      this.logger.console(`${msg} ${JSON.stringify(obj, undefined, 4)}`);
    } else {
      this.logger.trace(msg, obj);
    }
  }

  protected sendMessage(command: string, notification: boolean, args?: any): void {
    this.seq += 1;
    const request: ts.server.protocol.Request = {
      command,
      seq: this.seq,
      type: 'request',
    };
    if (args) {
      request.arguments = args;
    }
    const serializedRequest = `${JSON.stringify(request)}\n`;
    this.tsServerProcess?.stdin?.write(serializedRequest);
    this.log(notification ? 'notify' : 'request', request);
  }

  protected processMessage(untrimmedMessageString: string, resolve?: () => void, reject?: (err) => void): void {
    const messageString = untrimmedMessageString.trim();
    if (!messageString || messageString.startsWith('Content-Length:')) {
      return;
    }
    let message: ts.server.protocol.Message;

    try {
      message = JSON.parse(messageString);
    } catch {
      // If the message isn't valid JSON, it's not a valid tsserver message. Reject the promise.
      reject?.(new Error(`Received invalid message from TSServer: ${untrimmedMessageString}`));
      return;
    }

    this.log('processMessage', message);

    if (this.isEvent(message)) {
      resolve?.();
    }

    if (this.isResponse(message)) {
      this.resolveResponse(message, message.request_seq, message.success);
    } else if (this.isEvent(message)) {
      if (this.isRequestCompletedEvent(message)) {
        this.resolveResponse(message, message.body.request_seq, true);
      } else if (this.options.onEvent) {
        this.options.onEvent(message);
      }
    }
  }

  private resolveResponse(message: ts.server.protocol.Message, request_seq: number, success: boolean) {
    const deferred = this.deferreds[request_seq];
    this.log('request completed', { request_seq, success });
    if (deferred) {
      if (success) {
        this.deferreds[request_seq].resolve(message);
      } else {
        this.deferreds[request_seq].reject(message);
      }
      delete this.deferreds[request_seq];
    }
  }

  private isEvent(message: ts.server.protocol.Message): message is ts.server.protocol.Event {
    return message.type === 'event';
  }

  private isResponse(message: ts.server.protocol.Message): message is ts.server.protocol.Response {
    return message.type === 'response';
  }

  private isRequestCompletedEvent(
    message: ts.server.protocol.Message
  ): message is ts.server.protocol.RequestCompletedEvent {
    return this.isEvent(message) && message.event === 'requestCompleted';
  }

  private async ensureServerIsRunning() {
    if (!this.tsServerProcess) {
      await this.restart();
    }
  }
}
