import { flatten } from 'lodash';
import type { BundlerMain, ComponentServer } from '@teambit/bundler';
import {
  BundlerAspect,
  ComponentServerCompilationChangedEvent,
  ComponentServerStartedEvent,
  ComponentsServerStartedEvent,
  NewDevServersCreatedEvent,
} from '@teambit/bundler';
import type { PubsubMain } from '@teambit/pubsub';
import type { ProxyEntry, StartPlugin, StartPluginOptions, UiMain } from '@teambit/ui';
import type { Workspace } from '@teambit/workspace';
import { SubscribeToEvents } from '@teambit/preview.cli.dev-server-events-listener';
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
  private bootstrapActive = false;
  private lastBootstrapText = '';

  private cacheServerLookup(server: ComponentServer) {
    const lookupKeys = new Set<string>([
      server.context.envRuntime.id,
      server.context.id,
      ...(server.context.relatedContexts || []),
    ]);
    lookupKeys.forEach((key) => {
      if (!key) return;
      this.serversMap[key] = server;
    });
  }

  private resolveServerByEventId(eventId: string): ComponentServer | undefined {
    const direct = this.serversMap[eventId] || this.pendingServers.get(eventId);
    if (direct) return direct;

    return Object.values(this.serversMap).find((server) => {
      if (!server) return false;
      if (server.context.envRuntime.id === eventId) return true;
      if (server.context.id === eventId) return true;
      return !!server.context.relatedContexts?.includes(eventId);
    });
  }

  private resolveEnvRuntimeId(eventId: string): string {
    return this.resolveServerByEventId(eventId)?.context.envRuntime.id || eventId;
  }

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
    this.cacheServerLookup(componentServer);
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
      const isCompilationDone = !!this.serversState[startedEnvId]?.isCompilationDone;
      // Ordering race guard:
      // compile "done" can arrive before component-server-started.
      // In that case we must keep proxy active, otherwise HMR sockets stay closed forever.
      uiServer.setComponentServerProxyActive(startedEnvId, isCompilationDone);

      if (wasPending) {
        if (isCompilationDone) {
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

  private async publishCompilationStatus(
    eventId: string,
    isCompiling: boolean,
    results?: { errors?: Error[]; warnings?: Error[] }
  ) {
    const server = this.resolveServerByEventId(eventId);
    const env = server?.context.envRuntime.id || eventId;
    const affectedEnvs = new Set<string>([env, eventId]);
    if (server?.context?.id) affectedEnvs.add(server.context.id);
    for (const relatedEnv of server?.context?.relatedContexts || []) {
      if (relatedEnv) affectedEnvs.add(relatedEnv);
    }
    await this.graphql.pubsub.publish(ComponentServerCompilationChangedEvent, {
      componentServerCompilation: {
        env,
        affectedEnvs: Array.from(affectedEnvs),
        url: server?.url,
        host: server?.host,
        basePath: server?.basePath,
        isCompiling,
        errorCount: results?.errors?.length || 0,
        warningCount: results?.warnings?.length || 0,
      },
    });
  }

  async onNewDevServersCreated(servers: ComponentServer[]) {
    for (const server of servers) {
      const envId = server.context.envRuntime.id;
      this.cacheServerLookup(server);
      this.pendingServers.set(envId, server);

      this.serversState[envId] = {
        isCompiling: true,
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
    this.upsertBootstrapSpinner('Preview dev servers: preparing...');
    try {
      this.listenToDevServers(options.showInternalUrls);
      const workspaceIdsCount = this.workspace.listIds().length;
      this.upsertBootstrapSpinner(
        `Preview dev servers: loading workspace components ${chalk.dim('→')} ${chalk.cyan(workspaceIdsCount.toString())}`
      );
      const componentsLoadStart = Date.now();
      const components = await this.workspace.getComponentsByUserInput(!options.pattern, options.pattern);
      const componentsLoadMs = Date.now() - componentsLoadStart;
      const componentsCount = components.length;
      this.upsertBootstrapSpinner(
        `Preview dev servers: runtime ready ${chalk.dim('→')} ${chalk.cyan(componentsCount.toString())} component${
          componentsCount === 1 ? '' : 's'
        } ${chalk.dim(`in ${(componentsLoadMs / 1000).toFixed(1)}s`)}`
      );

      // TODO: logic for creating preview servers must be refactored to this aspect from the DevServer aspect.
      this.upsertBootstrapSpinner('Preview dev servers: creating environments...');
      const envCreateStart = Date.now();
      const previewServers = await this.bundler.devServer(components);
      const envCreateMs = Date.now() - envCreateStart;
      const envCount = previewServers.length;

      if (!envCount) {
        this.succeedBootstrapSpinner('No preview dev servers were created (no preview environments matched).');
        this.setReady();
      } else {
        this.upsertBootstrapSpinner(
          `Preview dev servers: bootstrapped ${chalk.dim('→')} ${chalk.cyan(envCount.toString())} environment${
            envCount === 1 ? '' : 's'
          } ${chalk.dim(`in ${(envCreateMs / 1000).toFixed(1)}s`)}. Waiting for compilation...`
        );
      }

      previewServers.forEach((server) => {
        const envId = server.context.envRuntime.id;
        this.cacheServerLookup(server);

        this.serversState[envId] = {
          isCompiling: true,
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
    } catch (err: any) {
      this.failBootstrapSpinner(`Preview dev server bootstrap failed: ${err?.message || err}`);
      throw err;
    }
  }

  private upsertBootstrapSpinner(text: string) {
    if (this.lastBootstrapText === text) return;
    this.bootstrapActive = true;
    this.lastBootstrapText = text;
    this.logger.console(chalk.cyan(`preview bootstrap: ${text}`));
  }

  private succeedBootstrapSpinner(text: string) {
    this.bootstrapActive = false;
    this.lastBootstrapText = text;
    this.logger.console(chalk.green(`preview bootstrap: ${text}`));
  }

  private failBootstrapSpinner(text: string) {
    this.bootstrapActive = false;
    this.lastBootstrapText = text;
    this.logger.console(chalk.red(`preview bootstrap: ${text}`));
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
  }

  private handleOnStartCompiling(id: string) {
    const server = this.resolveServerByEventId(id);
    const envId = this.resolveEnvRuntimeId(id);
    if (server) {
      server.isCompiling = true;
    }
    const uiServer = this.ui.getUIServer();
    uiServer?.setComponentServerProxyActive(envId, false);
    if (this.bootstrapActive) {
      const label = chalk.cyan(envId);
      this.succeedBootstrapSpinner(`Preview compilation started ${chalk.dim('→')} ${label}`);
    }

    this.serversState[envId] = {
      ...this.serversState[envId],
      isCompiling: true,
    };
    const spinnerId = getSpinnerId(envId);
    const text = getSpinnerCompilingMessage(server, envId);
    const exists = this.logger.multiSpinner.spinners[spinnerId];
    if (!exists) {
      this.logger.multiSpinner.add(spinnerId, { text });
    }
    this.publishCompilationStatus(id, true).catch((err) => {
      this.logger.error(`failed to publish compilation-start status for ${id}`, err);
    });
  }

  private handleOnDoneCompiling(id: string, results, showInternalUrls?: boolean) {
    const previewServer = this.resolveServerByEventId(id);
    const envId = this.resolveEnvRuntimeId(id);
    if (previewServer) {
      previewServer.isCompiling = false;
    }
    const uiServer = this.ui.getUIServer();
    uiServer?.setComponentServerProxyActive(envId, true);

    this.serversState[envId] = {
      ...this.serversState[envId],
      isCompiling: false,
      isReady: true,
      isCompilationDone: true,
      errors: results.errors,
      warnings: results.warnings,
    };
    const spinnerId = getSpinnerId(envId);
    const spinner = this.logger.multiSpinner.spinners[spinnerId];
    if (spinner && spinner.isActive()) {
      const errors = results.errors || [];
      const hasErrors = !!errors.length;
      const warnings = getWarningsWithoutIgnored(results.warnings);
      const hasWarnings = !!warnings.length;
      const url = previewServer ? `http://localhost:${previewServer.port}` : '';
      const text = getSpinnerDoneMessage(previewServer, errors, warnings, url, envId, undefined, showInternalUrls);
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
    this.publishCompilationStatus(id, false, results).catch((err) => {
      this.logger.error(`failed to publish compilation-done status for ${id}`, err);
    });
    if (this.serversState[envId]?.isPendingPublish) {
      const server = this.resolveServerByEventId(id);
      if (server) {
        this.serversState[envId].isPendingPublish = false;
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

function getSpinnerCompilingMessage(server?: ComponentServer, fallbackEnvId?: string, verbose = false) {
  if (!server) {
    const envId = chalk.cyan(fallbackEnvId || 'unknown-env');
    return `${chalk.yellow('Compiling')} ${envId}`;
  }
  const envId = chalk.cyan(server.context.envRuntime.id);
  let includedEnvs = '';
  if (server.context.relatedContexts && server.context.relatedContexts.length > 1) {
    includedEnvs = `on behalf of ${chalk.cyan(stringifyIncludedEnvs(server.context.relatedContexts, verbose))}`;
  }
  return `${chalk.yellow('Compiling')} ${envId} ${includedEnvs}`;
}

function getSpinnerDoneMessage(
  server: ComponentServer | undefined,
  errors: Error[],
  warnings: Error[],
  url: string,
  fallbackEnvId?: string,
  verbose = false,
  showInternalUrls?: boolean
) {
  const hasErrors = !!errors.length;
  const hasWarnings = !!warnings.length;
  const envId = chalk.cyan(server?.context.envRuntime.id || fallbackEnvId || 'unknown-env');
  let includedEnvs = '';
  if (server?.context.relatedContexts && server.context.relatedContexts.length > 1) {
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
