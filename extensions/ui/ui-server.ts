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

import { ProxyEntry, UIRoot } from './ui-root';
import { UIRuntime } from './ui.aspect';
import { UiMain } from './ui.main.runtime';
import { devConfig } from './webpack/webpack.dev.config';

const errorOverlayMiddleware = require('react-dev-utils/errorOverlayMiddleware');
const evalSourceMapMiddleware = require('react-dev-utils/evalSourceMapMiddleware');

export type UIServerProps = {
  graphql: GraphqlMain;
  express: ExpressMain;
  ui: UiMain;
  uiRoot: UIRoot;
  uiRootExtension: string;
  logger: Logger;
};

export type StartOptions = {
  /**
   * port for the UI server to bind. default is a port range of 4000-4200.
   */
  port?: number;

  /**
   * port for the ui sub
   */
  wsPort?: number;
};

export class UIServer {
  constructor(
    private graphql: GraphqlMain,
    private expressExtension: ExpressMain,
    private ui: UiMain,
    private uiRoot: UIRoot,
    private uiRootExtension: string,
    private logger: Logger
  ) {}

  private _port = 0;

  get port() {
    return this._port;
  }

  /**
   * get the webpack configuration of the UI server.
   */
  async getDevConfig(): Promise<webpack.Configuration> {
    const aspects = await this.uiRoot.resolveAspects(UIRuntime.name);
    const aspectsPaths = aspects.map((aspect) => aspect.aspectPath);

    return devConfig(
      this.uiRoot.path,
      [await this.ui.generateRoot(aspects, this.uiRootExtension)],
      this.uiRootExtension,
      aspectsPaths
    );
  }

  /**
   * start a UI server.
   */
  async start({ port, wsPort }: StartOptions = {}) {
    const app = this.expressExtension.createApp();
    // TODO: better handle ports.
    const selectedPort = await this.selectPort(port || 4000);
    const root = join(this.uiRoot.path, '/public');
    const server = await this.graphql.createServer({ app });
    const subscriptionPort = await this.selectPort(wsPort || 4001);
    this.graphql.createSubscription({}, subscriptionPort);

    await this.configureProxy(app, server);
    app.use(express.static(root));
    app.use(fallback('index.html', { root }));
    server.listen(selectedPort);
    this._port = selectedPort;
    this.logger.info(`UI server of ${this.uiRootExtension} is listening to port ${selectedPort}`);
  }

  // TODO - check if this is necessary
  private async configureProxy(app: Express, server: Server) {
    const proxServer = httpProxy.createProxyServer();
    const proxyEntries = this.uiRoot.getProxy ? await this.uiRoot.getProxy() : [];
    server.on('upgrade', function (req, socket, head) {
      // TODO: put it on graphql aspect
      if (req.url === '/subscriptions') {
        proxServer.ws(req, socket, head, { target: { host: 'localhost', port: 4001 } });
      }
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
    const devServer = new WebpackDevServer(compiler, devServerConfig);
    devServer.listen(selectedPort);
    return devServer;
  }

  private async selectPort(port?: number) {
    if (port) return port;
    return getPort({ port: getPort.makeRange(3000, 3200) });
  }

  private getBefore() {
    return async (app: Express, server: Server) => {
      // Keep `evalSourceMapMiddleware` and `errorOverlayMiddleware`
      // middlewares before `redirectServedPath` otherwise will not have any effect
      // This lets us fetch source contents from webpack for the error overlay
      app.use(evalSourceMapMiddleware(server));
      // This lets us open files from the runtime error overlay.
      app.use(errorOverlayMiddleware());
    };
  }

  private async getProxy() {
    const proxyEntries = (await this.uiRoot.getProxy?.()) || [];

    const gqlProxies: ProxyEntry[] = [
      {
        context: ['/graphql', '/api'],
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      {
        context: ['/subscriptions'],
        target: 'ws://localhost:4001',
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
    return new UIServer(props.graphql, props.express, props.ui, props.uiRoot, props.uiRootExtension, props.logger);
  }
}
