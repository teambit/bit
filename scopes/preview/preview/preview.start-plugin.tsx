import { flatten } from 'lodash';
import type { BundlerMain, ComponentServer } from '@teambit/bundler';
import {
  BundlerAspect,
  ComponentServerStartedEvent,
  ComponentsServerStartedEvent,
  NewDevServersCreatedEvent,
} from '@teambit/bundler';
import type { PubsubMain } from '@teambit/pubsub';
import type { ProxyEntry, StartPlugin, StartPluginOptions, UiMain } from '@teambit/ui';
import type { Workspace } from '@teambit/workspace';
import { SubscribeToEvents } from '@teambit/preview.cli.dev-server-events-listener';
import { SubscribeToWebpackEvents } from '@teambit/preview.cli.webpack-events-listener';
import { CompilationInitiator } from '@teambit/compiler';
import type { Logger } from '@teambit/logger';
import type { WatcherMain } from '@teambit/watcher';
import { CheckTypes } from '@teambit/watcher';
import type { GraphqlMain } from '@teambit/graphql';
import chalk from 'chalk';

type ServerState = {
  isCompiling?: boolean;
  isReady?: boolean;
  errors?: Error[];
  warnings?: Error[];
  results?: any[];
  isStarted?: boolean;
  isCompilationDone?: boolean;
  isPendingPublish?: boolean;
};

type ServerStateMap = Record<string, ServerState>;

export class PreviewStartPlugin implements StartPlugin {
  previewServers: ComponentServer[] = [];
  serversState: ServerStateMap = {};
  serversMap: Record<string, ComponentServer> = {};
  private pendingServers: Map<string, ComponentServer> = new Map();

  constructor(
    private workspace: Workspace,
    private bundler: BundlerMain,
    private ui: UiMain,
    private pubsub: PubsubMain,
    private logger: Logger,
    private watcher: WatcherMain,
    private graphql: GraphqlMain
  ) {
    this.pubsub.sub(BundlerAspect.id, async (event) => {
      if (event.type === NewDevServersCreatedEvent.TYPE) {
        await this.onNewDevServersCreated(event.componentsServers);
      }
      if (event.type === ComponentsServerStartedEvent.TYPE) {
        await this.onComponentServerStarted(event.componentsServer);
      }
    });
  }

  async onComponentServerStarted(componentServer: ComponentServer) {
    const startedEnvId = componentServer.context.envRuntime.id;
    this.serversMap[startedEnvId] = componentServer;
    const wasPending = this.pendingServers.has(startedEnvId);
    this.pendingServers.delete(startedEnvId);

    this.serversState[startedEnvId] = {
      ...this.serversState[startedEnvId],
      isStarted: true,
    };

    const index = this.previewServers.findIndex((s) => s.context.envRuntime.id === startedEnvId);
    if (index >= 0) {
      this.previewServers[index] = componentServer;
    } else {
      this.previewServers.push(componentServer);
    }

    const uiServer = this.ui.getUIServer();
    if (uiServer) {
      uiServer.addComponentServerProxy(componentServer);

      if (wasPending) {
        if (this.serversState[startedEnvId]?.isCompilationDone) {
          await this.publishServerStarted(componentServer);
        } else {
          this.serversState[startedEnvId] = {
            ...this.serversState[startedEnvId],
            isPendingPublish: true,
          };
          this.logger.console(
            `Server ${startedEnvId} started but waiting for compilation to complete before publishing event.`
          );
        }
      }
    }
  }

  private async publishServerStarted(server: ComponentServer) {
    await this.graphql.pubsub.publish(ComponentServerStartedEvent, {
      componentServers: server,
    });
  }

  async onNewDevServersCreated(servers: ComponentServer[]) {
    for (const server of servers) {
      const envId = server.context.envRuntime.id;
      this.pendingServers.set(envId, server);

      this.serversState[envId] = {
        isCompiling: false,
        isReady: false,
        isStarted: false,
        isCompilationDone: false,
        isPendingPublish: false,
      };

      try {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        server.listen();
      } catch (err) {
        this.logger.error(`failed to start server for ${envId}`, err);
      }
    }
  }

  async initiate(options: StartPluginOptions) {
    this.listenToDevServers(options.showInternalUrls);
    const components = await this.workspace.getComponentsByUserInput(!options.pattern, options.pattern);
    // TODO: logic for creating preview servers must be refactored to this aspect from the DevServer aspect.
    const previewServers = await this.bundler.devServer(components);
    previewServers.forEach((server) => {
      const envId = server.context.envRuntime.id;
      this.serversMap[envId] = server;

      this.serversState[envId] = {
        isCompiling: false,
        isReady: false,
        isStarted: false,
        isCompilationDone: false,
        isPendingPublish: false,
      };

      // DON'T add wait! this promise never resolves, so it would stop the start process!
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      server.listen();
    });
    this.watcher
      .watch({
        spawnTSServer: true,
        checkTypes: CheckTypes.None,
        preCompile: false,
        compile: true,
        initiator: CompilationInitiator.Start,
      })
      .catch((err) => {
        const msg = `watcher found an error`;
        this.logger.error(msg, err);
        this.logger.console(`${msg}, ${err.message}`);
      });
    this.previewServers = this.previewServers.concat(previewServers);
  }

  getProxy(): ProxyEntry[] {
    const proxyConfigs = this.previewServers.map<ProxyEntry[]>((server) => {
      return [
        {
          context: [`/preview/${server.context.envRuntime.id}`],
          target: `http://localhost:${server.port}`,
        },
        {
          context: [`/_hmr/${server.context.envRuntime.id}`],
          target: `http://localhost:${server.port}`,
          ws: true,
        },
      ];
    });

    return flatten(proxyConfigs);
  }

  // TODO: this should be a part of the devServer
  private listenToDevServers(showInternalUrls?: boolean) {
    // keep state changes immutable!
    SubscribeToEvents(this.pubsub, {
      onStart: (id) => {
        this.handleOnStartCompiling(id);
      },
      onDone: (id, results) => {
        this.handleOnDoneCompiling(id, results, showInternalUrls);
      },
    });
    // @deprecated
    // for legacy webpack bit report plugin
    SubscribeToWebpackEvents(this.pubsub, {
      onStart: (id) => {
        this.handleOnStartCompiling(id);
      },
      onDone: (id, results) => {
        this.handleOnDoneCompiling(id, results, showInternalUrls);
      },
    });
  }

  private handleOnStartCompiling(id: string) {
    this.serversState[id] = {
      ...this.serversState[id],
      isCompiling: true,
    };
    const spinnerId = getSpinnerId(id);
    const text = getSpinnerCompilingMessage(this.serversMap[id] || this.pendingServers.get(id));
    const exists = this.logger.multiSpinner.spinners[spinnerId];
    if (!exists) {
      this.logger.multiSpinner.add(spinnerId, { text });
    }
  }

  private handleOnDoneCompiling(id: string, results, showInternalUrls?: boolean) {
    this.serversState[id] = {
      ...this.serversState[id],
      isCompiling: false,
      isReady: true,
      isCompilationDone: true,
      errors: results.errors,
      warnings: results.warnings,
    };
    const previewServer = this.serversMap[id] || this.pendingServers.get(id);
    const spinnerId = getSpinnerId(id);
    const spinner = this.logger.multiSpinner.spinners[spinnerId];
    if (spinner && spinner.isActive()) {
      const errors = results.errors || [];
      const hasErrors = !!errors.length;
      const warnings = getWarningsWithoutIgnored(results.warnings);
      const hasWarnings = !!warnings.length;
      const url = `http://localhost:${previewServer.port}`;
      const text = getSpinnerDoneMessage(this.serversMap[id], errors, warnings, url, undefined, showInternalUrls);
      if (hasErrors) {
        this.logger.multiSpinner.fail(spinnerId, { text });
      } else if (hasWarnings) {
        this.logger.multiSpinner.warn(spinnerId, { text });
      } else {
        this.logger.multiSpinner.succeed(spinnerId, { text });
      }
    }

    const noneAreCompiling = Object.values(this.serversState).every((x) => !x.isCompiling);
    if (noneAreCompiling) this.setReady();
    if (this.serversState[id]?.isPendingPublish) {
      const server = this.serversMap[id];
      if (server) {
        this.serversState[id].isPendingPublish = false;
        this.publishServerStarted(server).catch((err) => {
          this.logger.error(`failed to publish server started event for ${server.context.envRuntime.id}`, err);
        });
      }
    }
  }

  private setReady: () => void;
  private readyPromise = new Promise<void>((resolve) => (this.setReady = resolve));
  get whenReady(): Promise<void> {
    return this.readyPromise;
  }
}

function getWarningsWithoutIgnored(warnings?: Error[]): Error[] {
  if (!warnings || !warnings.length) return [];
  const IGNORE_WARNINGS = [
    // Webpack 5+ has no facility to disable this warning.
    // System.import is used in @angular/core for deprecated string-form lazy routes
    /System.import\(\) is deprecated and will be removed soon/i,
    // We need to include all the files in the compilation because we don't know what people will use in their compositions
    /is part of the TypeScript compilation but it's unused/i,
    // https://github.com/webpack-contrib/source-map-loader/blob/b2de4249c7431dd8432da607e08f0f65e9d64219/src/index.js#L83
    /Failed to parse source map from/,
  ];
  warnings.filter((warning) => !IGNORE_WARNINGS.find((reg) => warning?.message?.match(reg)));
  return warnings;
}

function getSpinnerId(envId: string) {
  return `preview-${envId}`;
}

function getSpinnerCompilingMessage(server: ComponentServer, verbose = false) {
  const envId = chalk.cyan(server.context.envRuntime.id);
  let includedEnvs = '';
  if (server.context.relatedContexts && server.context.relatedContexts.length > 1) {
    includedEnvs = `on behalf of ${chalk.cyan(stringifyIncludedEnvs(server.context.relatedContexts, verbose))}`;
  }
  return `${chalk.yellow('Compiling')} ${envId} ${includedEnvs}`;
}

function getSpinnerDoneMessage(
  server: ComponentServer,
  errors: Error[],
  warnings: Error[],
  url: string,
  verbose = false,
  showInternalUrls?: boolean
) {
  const hasErrors = !!errors.length;
  const hasWarnings = !!warnings.length;
  const envId = chalk.cyan(server.context.envRuntime.id);
  let includedEnvs = '';
  if (server.context.relatedContexts && server.context.relatedContexts.length > 1) {
    includedEnvs = ` ${chalk.dim('via')} ${chalk.cyan(stringifyIncludedEnvs(server.context.relatedContexts, verbose))}`;
  }
  const errorsTxt = hasErrors ? errors.map((err) => err.message).join('\n') : '';
  const errorsTxtWithTitle = hasErrors ? chalk.red(`\nErrors:\n${errorsTxt}`) : '';
  const warningsTxt = hasWarnings ? warnings.map((warning) => warning.message).join('\n') : '';
  const warningsTxtWithTitle = hasWarnings ? chalk.yellow(`\nWarnings:\n${warningsTxt}`) : '';

  if (hasErrors) {
    return `${chalk.red('Failed')} ${envId}${includedEnvs}${errorsTxtWithTitle}${warningsTxtWithTitle}`;
  }
  const urlMessage = hasErrors || !showInternalUrls ? '' : `at ${chalk.cyan(url)}`;
  return `${chalk.green('Ready')} ${envId}${includedEnvs} ${urlMessage}${warningsTxtWithTitle}`;
}

function stringifyIncludedEnvs(includedEnvs: string[] = [], verbose = false) {
  if (includedEnvs.length < 2) return '';
  if (includedEnvs.length > 2 && !verbose) return ` ${includedEnvs.length} other envs`;
  return includedEnvs.join(', ');
}
