import { flatten } from 'lodash';
import { ExpressMain } from '@teambit/express';
import { GraphqlMain } from '@teambit/graphql';
import { Logger } from '@teambit/logger';
import express, { Express } from 'express';
import fallback from 'express-history-api-fallback';
import { Port } from '@teambit/toolbox.network.get-port';
import { Server } from 'http';
import httpProxy from 'http-proxy';
import { join } from 'path';
import webpack from 'webpack';
import WebpackDevServer, { Configuration as WdsConfiguration } from 'webpack-dev-server';
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
   * port range for the UI server to bind. default is a port range of 4000-4200.
   */
  portRange?: number[] | number;
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

  /** the hostname for the server to listen at. Currently statically 'localhost' */
  get host() {
    return 'localhost';
  }

  /** the server listens at this url */
  get fullUrl() {
    const port = this.port !== 80 ? `:${this.port}` : '';
    return `http://${this.host}${port}`;
  }

  get buildOptions() {
    return this.uiRoot.buildOptions;
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
  async start({ portRange }: StartOptions = {}) {
    const app = this.expressExtension.createApp();
    const publicDir = `/${this.publicDir}`;
    const root = join(this.uiRoot.path, publicDir);
    const server = await this.graphql.createServer({ app });

    // set up proxy, for things like preview, e.g. '/preview/teambit.react/react'
    await this.configureProxy(app, server);

    // pass through files from public /folder:
    // setting `index: false` so index.html will be served by the fallback() middleware
    app.use(express.static(root, { index: false }));

    const port = await Port.getPortFromRange(portRange || [3100, 3200]);

    await this.setupServerSideRendering({ root, port, app });

    // in any and all other cases, serve index.html.
    // No any other endpoints past this will execute
    app.use(fallback('index.html', { root }));

    server.listen(port);
    this._port = port;

    // important: we use the string of the following message for the http.e2e.ts. if you change the message,
    // please make sure you change the `HTTP_SERVER_READY_MSG` const.
    this.logger.info(`UI server of ${this.uiRootExtension} is listening to port ${port}`);
  }

  getPluginsComponents() {
    return this.plugins.map((plugin) => {
      return plugin.render();
    });
  }

  private async setupServerSideRendering({ root, port, app }: { root: string; port: number; app: Express }) {
    if (!this.buildOptions?.ssr) return;

    const ssrMiddleware = await createSsrMiddleware({
      root,
      port,
      title: this.uiRoot.name,
      logger: this.logger,
    });

    if (!ssrMiddleware) {
      this.logger.warn('[ssr] middleware failed setup');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    app.get('*', ssrMiddleware);
    this.logger.debug('[ssr] serving for "*"');
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
  async dev({ portRange }: StartOptions = {}) {
    const selectedPort = await this.selectPort(portRange);
    await this.start({ portRange: [4100, 4200] });
    const config = await this.getDevConfig();
    const compiler = webpack(config);
    const devServerConfig = await this.getDevServerConfig(this._port, config.devServer);
    // @ts-ignore in the capsules it throws an error about compatibilities issues between webpack.compiler and webpackDevServer/webpack/compiler
    const devServer = new WebpackDevServer(compiler, devServerConfig);
    devServer.listen(selectedPort);
    this._port = selectedPort;
    return devServer;
  }

  private async selectPort(portRange?: number[] | number) {
    return Port.getPortFromRange(portRange || [3100, 3200]);
  }

  private async getProxyFromPlugins(): Promise<ProxyEntry[]> {
    const proxiesByPlugin = this.plugins.map((plugin) => {
      return plugin.getProxy ? plugin.getProxy() : [];
    });

    return flatten(await Promise.all(proxiesByPlugin));
  }

  private async getProxy(port = 4000) {
    const proxyEntries = await this.getProxyFromPlugins();

    const gqlProxies: ProxyEntry[] = [
      {
        context: ['/graphql', '/api'],
        target: `http://${this.host}:${port}`,
        changeOrigin: true,
      },
      {
        context: ['/subscriptions'],
        target: `ws://${this.host}:${port}`,
        ws: true,
      },
    ];

    return gqlProxies.concat(proxyEntries);
  }

  private async getDevServerConfig(port: number, config?: WdsConfiguration): Promise<WdsConfiguration> {
    const proxy = await this.getProxy(port);
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
