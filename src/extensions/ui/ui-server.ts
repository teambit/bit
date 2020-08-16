import { Server } from 'http';
import { join } from 'path';
import httpProxy from 'http-proxy';
import WebpackDevServer from 'webpack-dev-server';
import fallback from 'express-history-api-fallback';
import webpack from 'webpack';
import getPort from 'get-port';
import express, { Express } from 'express';
import { devConfig } from './webpack/webpack.dev.config';
import { GraphQLExtension } from '../graphql';
import { ExpressExtension } from '../express';
import { UIExtension } from './ui.extension';
import { UIRoot, ProxyEntry } from './ui-root';
import { Logger } from '../logger';

const errorOverlayMiddleware = require('react-dev-utils/errorOverlayMiddleware');
const evalSourceMapMiddleware = require('react-dev-utils/evalSourceMapMiddleware');

export type UIServerProps = {
  graphql: GraphQLExtension;
  express: ExpressExtension;
  ui: UIExtension;
  uiRoot: UIRoot;
  uiRootExtension: string;
  logger: Logger;
};

export type StartOptions = {
  /**
   * port for the UI server to bind. default is a port range of 4000-4200.
   */
  port?: number;
};

export class UIServer {
  constructor(
    private graphql: GraphQLExtension,
    private expressExtension: ExpressExtension,
    private ui: UIExtension,
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
    return devConfig(
      this.uiRoot.path,
      [await this.ui.generateRoot(this.uiRoot.extensionsPaths, this.uiRootExtension)],
      this.uiRootExtension
    );
  }

  /**
   * start a UI server.
   */
  async start({ port }: StartOptions = {}) {
    const app = this.expressExtension.createApp();
    // TODO: better handle ports.
    const selectedPort = await this.selectPort(port || 4000);
    const root = join(this.uiRoot.path, '/public');
    await this.configureProxy(app);
    app.use(express.static(root));
    app.use(fallback('index.html', { root }));
    const server = await this.graphql.createServer({ app });

    server.listen(selectedPort);
    this._port = selectedPort;
    this.logger.info(`UI server of ${this.uiRootExtension} is listening to port ${selectedPort}`);
  }

  // TODO - check if this is necessary
  private async configureProxy(app: Express) {
    const proxy = httpProxy.createProxyServer();
    const proxyEntries = this.uiRoot.getProxy ? await this.uiRoot.getProxy() : [];
    proxyEntries.forEach((entry) => {
      entry.context.forEach((route) =>
        app.use(`${route}/*`, (req, res) => {
          proxy.web(req, res, { ...entry, target: `${entry.target}/${req.originalUrl}` });
        })
      );
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
    return new UIServer(props.graphql, props.express, props.ui, props.uiRoot, props.uiRootExtension, props.logger);
  }
}
