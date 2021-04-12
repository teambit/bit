import { flatten } from 'lodash';
import { ExpressMain } from '@teambit/express';
import { GraphqlMain } from '@teambit/graphql';
import { Logger } from '@teambit/logger';
import express, { Express } from 'express';
import fallback from 'express-history-api-fallback';
import getPort from 'get-port';
import { Server } from 'http';
import httpProxy from 'http-proxy';
import { join } from 'path';
import webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import { createSsrMiddleware } from './ssr/render-middleware';
import { StartPlugin } from './start-plugin';
import { ProxyEntry, UIRoot } from './ui-root';
import { UIRuntime } from './ui.aspect';
import { UiMain } from './ui.main.runtime';

const { devConfig } = require('./webpack/webpack.dev.config');

export type UIServerProps = {
  graphql: GraphqlMain;
  express: ExpressMain;
  ui: UiMain;
  uiRoot: UIRoot;
  uiRootExtension: string;
  logger: Logger;
  publicDir: string;
  startPlugins: StartPlugin[];
};

export type StartOptions = {
  /**
   * port for the UI server to bind. default is a port range of 4000-4200.
   */
  port?: number;
};

export class UIServer {
  constructor(
    private graphql: GraphqlMain,
    private expressExtension: ExpressMain,
    private ui: UiMain,
    private uiRoot: UIRoot,
    private uiRootExtension: string,
    private logger: Logger,
    private publicDir: string,
    private plugins: StartPlugin[]
  ) {}

  getName() {
    return this.uiRoot.name;
  }

  private _port = 0;

  get port() {
    return this._port;
  }

  /**
   * get the webpack configuration of the UI server.
   */
  async getDevConfig(): Promise<any> {
    const aspects = await this.uiRoot.resolveAspects(UIRuntime.name);
    const aspectsPaths = aspects.map((aspect) => aspect.aspectPath);

    return devConfig(
      this.uiRoot.path,
      [await this.ui.generateRoot(aspects, this.uiRootExtension)],
      this.uiRoot.name,
      aspectsPaths
    );
  }

  /**
   * start a UI server.
   */
  async start({ port }: StartOptions = {}) {
    const app = this.expressExtension.createApp();
    // TODO: better handle ports.
    const selectedPort = await this.selectPort(port || 4000);
    const publicDir = `/${this.publicDir}`;
    const root = join(this.uiRoot.path, publicDir);
    const server = await this.graphql.createServer({ app });

    // set up proxy, for things like preview, e.g. '/preview/teambit.react/react'
    await this.configureProxy(app, server);

    // pass through files from public /folder:
    // setting `index: false` so index.html will be served by the fallback() middleware
    app.use(express.static(root, { index: false }));

    if (this.uiRoot.buildOptions?.ssr) {
      const ssrMiddleware = await createSsrMiddleware({
        root,
        port: selectedPort,
        title: this.uiRoot.name,
        logger: this.logger,
      });

      if (ssrMiddleware) {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        app.get('*', ssrMiddleware);
        this.logger.debug('[ssr] serving for "*"');
      } else {
        this.logger.warn('[ssr] middleware failed setup');
      }
    }

    // in any and all other cases, serve index.html.
    // No any other endpoints past this will execute
    app.use(fallback('index.html', { root }));

    server.listen(selectedPort);
    this._port = selectedPort;

    this.logger.info(`UI server of ${this.uiRootExtension} is listening to port ${selectedPort}`);
  }

  getPluginsComponents() {
    return this.plugins.map((plugin) => {
      return plugin.render();
    });
  }

  private async configureProxy(app: Express, server: Server) {
    const proxServer = httpProxy.createProxyServer();
    proxServer.on('error', (e) => this.logger.error(e.message));
    const proxyEntries = await this.getProxyFromPlugins();
    server.on('upgrade', function (req, socket, head) {
      const entry = proxyEntries.find((proxy) => proxy.context.some((item) => item === req.url));
      if (!entry) return;
      proxServer.ws(req, socket, head, {
        target: entry.target,
      });
    });

    proxyEntries.forEach((entry) => {
      entry.context.forEach((route) => {
        app.use(`${route}/*`, (req, res) => {
          proxServer.web(req, res, { ...entry, target: `${entry.target}/${req.originalUrl}` });
        });
      });
    });
  }

  /**
   * start a UI dev server.
   */
  async dev({ port }: StartOptions = {}) {
    const selectedPort = await this.selectPort(port);
    // improve port management.
    await this.start({ port: await getPort({ port: 4000 }) });
    const config = await this.getDevConfig();
    const compiler = webpack(config);
    const devServerConfig = await this.getDevServerConfig(config.devServer);
    // @ts-ignore in the capsules it throws an error about compatibilities issues between webpack.compiler and webpackDevServer/webpack/compiler
    const devServer = new WebpackDevServer(compiler, devServerConfig);
    devServer.listen(selectedPort);
    return devServer;
  }

  private async selectPort(port?: number) {
    if (port) return port;
    return getPort({ port: getPort.makeRange(3100, 3200) });
  }

  private async getProxyFromPlugins() {
    const proxiesByPlugin = this.plugins.map((plugin) => {
      return plugin.getProxy ? plugin.getProxy() : [];
    });

    return flatten(await Promise.all(proxiesByPlugin));
  }

  private async getProxy() {
    const proxyEntries = await this.getProxyFromPlugins();

    const gqlProxies: ProxyEntry[] = [
      {
        context: ['/graphql', '/api'],
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      {
        context: ['/subscriptions'],
        target: 'ws://localhost:4000',
        ws: true,
      },
    ];

    return gqlProxies.concat(proxyEntries);
  }

  private async getDevServerConfig(config?: webpack.Configuration): Promise<webpack.Configuration> {
    const proxy = await this.getProxy();
    const devServerConf = { ...config, proxy };

    return devServerConf;
  }

  static create(props: UIServerProps) {
    return new UIServer(
      props.graphql,
      props.express,
      props.ui,
      props.uiRoot,
      props.uiRootExtension,
      props.logger,
      props.publicDir,
      props.startPlugins
    );
  }
}
