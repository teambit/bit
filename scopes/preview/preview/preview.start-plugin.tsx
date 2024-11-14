import { flatten } from 'lodash';
import { BundlerMain, ComponentServer } from '@teambit/bundler';
import { PubsubMain } from '@teambit/pubsub';
import { ProxyEntry, StartPlugin, StartPluginOptions, UiMain } from '@teambit/ui';
import { Workspace } from '@teambit/workspace';
import { SubscribeToEvents } from '@teambit/preview.cli.dev-server-events-listener';
import { SubscribeToWebpackEvents } from '@teambit/preview.cli.webpack-events-listener';
import { CompilationInitiator } from '@teambit/compiler';
import { Logger } from '@teambit/logger';
import { CheckTypes, WatcherMain } from '@teambit/watcher';
import chalk from 'chalk';

type ServerState = {
  isCompiling?: boolean;
  isReady?: boolean;
  errors?: Error[];
  warnings?: Error[];
  results?: any[];
};

type ServerStateMap = Record<string, ServerState>;

export class PreviewStartPlugin implements StartPlugin {
  constructor(
    private workspace: Workspace,
    private bundler: BundlerMain,
    private ui: UiMain,
    private pubsub: PubsubMain,
    private logger: Logger,
    private watcher: WatcherMain
  ) {}

  previewServers: ComponentServer[] = [];
  serversState: ServerStateMap = {};
  serversMap: Record<string, ComponentServer> = {};

  async initiate(options: StartPluginOptions) {
    this.listenToDevServers();

    const components = await this.workspace.getComponentsByUserInput(!options.pattern, options.pattern);
    // TODO: logic for creating preview servers must be refactored to this aspect from the DevServer aspect.
    const previewServers = await this.bundler.devServer(components);
    previewServers.forEach((server) => {
      this.serversMap[server.context.envRuntime.id] = server;
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
  private listenToDevServers() {
    // keep state changes immutable!
    SubscribeToEvents(this.pubsub, {
      onStart: (id) => {
        this.handleOnStartCompiling(id);
      },
      onDone: (id, results) => {
        this.handleOnDoneCompiling(id, results);
      },
    });
    // @deprecated
    // for legacy webpack bit report plugin
    SubscribeToWebpackEvents(this.pubsub, {
      onStart: (id) => {
        this.handleOnStartCompiling(id);
      },
      onDone: (id, results) => {
        this.handleOnDoneCompiling(id, results);
      },
    });
  }

  private handleOnStartCompiling(id: string) {
    this.serversState[id] = { isCompiling: true };
    const spinnerId = getSpinnerId(id);
    const text = getSpinnerCompilingMessage(this.serversMap[id]);
    const exists = this.logger.multiSpinner.spinners[spinnerId];
    if (!exists) {
      this.logger.multiSpinner.add(spinnerId, { text });
    }
  }

  private handleOnDoneCompiling(id: string, results) {
    this.serversState[id] = {
      isCompiling: false,
      isReady: true,
      errors: results.errors,
      warnings: results.warnings,
    };
    const previewServer = this.serversMap[id];
    const spinnerId = getSpinnerId(id);
    const spinner = this.logger.multiSpinner.spinners[spinnerId];
    if (spinner && spinner.isActive()) {
      const errors = results.errors || [];
      const hasErrors = !!errors.length;
      const warnings = getWarningsWithoutIgnored(results.warnings);
      const hasWarnings = !!warnings.length;
      const url = `http://localhost:${previewServer.port}`;
      const text = getSpinnerDoneMessage(this.serversMap[id], errors, warnings, url);
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
  const prefix = 'COMPILING';
  const envId = chalk.cyan(server.context.envRuntime.id);
  let includedEnvs = '';
  if (server.context.relatedContexts && server.context.relatedContexts.length > 1) {
    includedEnvs = `on behalf of ${chalk.cyan(stringifyIncludedEnvs(server.context.relatedContexts, verbose))}`;
  }
  return `${prefix} ${envId} ${includedEnvs}`;
}

function getSpinnerDoneMessage(
  server: ComponentServer,
  errors: Error[],
  warnings: Error[],
  url: string,
  verbose = false
) {
  const hasErrors = !!errors.length;
  const hasWarnings = !!warnings.length;
  const prefix = hasErrors ? 'FAILED' : 'RUNNING';
  const envId = chalk.cyan(server.context.envRuntime.id);
  let includedEnvs = '';
  if (server.context.relatedContexts && server.context.relatedContexts.length > 1) {
    includedEnvs = ` on behalf of ${chalk.cyan(stringifyIncludedEnvs(server.context.relatedContexts, verbose))}`;
  }
  const errorsTxt = hasErrors ? errors.map((err) => err.message).join('\n') : '';
  const errorsTxtWithTitle = hasErrors ? chalk.red(`\nErrors:\n${errorsTxt}`) : '';
  const warningsTxt = hasWarnings ? warnings.map((warning) => warning.message).join('\n') : '';
  const warningsTxtWithTitle = hasWarnings ? chalk.yellow(`\nWarnings:\n${warningsTxt}`) : '';

  const urlMessage = hasErrors ? '' : `at ${chalk.cyan(url)}`;
  return `${prefix} ${envId}${includedEnvs} ${urlMessage} ${errorsTxtWithTitle} ${warningsTxtWithTitle}`;
}

function stringifyIncludedEnvs(includedEnvs: string[] = [], verbose = false) {
  if (includedEnvs.length < 2) return '';
  if (includedEnvs.length > 2 && !verbose) return ` ${includedEnvs.length} other envs`;
  return includedEnvs.join(', ');
}
