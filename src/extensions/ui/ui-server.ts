import { Server } from 'http';
import { join } from 'path';
import WebpackDevServer from 'webpack-dev-server';
import webpack from 'webpack';
import getPort from 'get-port';
import express, { Express } from 'express';
import { devConfig } from './webpack/webpack.dev.config';
import { GraphQLExtension } from '../graphql';
import { ExpressExtension } from '../express';
import { UIExtension } from './ui.extension';
import { UIRoot } from './ui-root';
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
    private express: ExpressExtension,
    private ui: UIExtension,
    private uiRoot: UIRoot,
    private uiRootExtension: string,
    private logger: Logger
  ) {}

  /**
   * get the webpack configuration of the UI server.
   */
  async getDevConfig() {
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
    const app = this.express.createApp();
    // TODO: better handle ports.
    const selectedPort = await this.selectPort(port || 4000);
    app.use(express.static(join(this.uiRoot.path, '/public')));
    const server = await this.graphql.createServer({ app });

    server.listen(selectedPort);
    this.logger.info(`UI server of ${this.uiRootExtension} is listening to port ${selectedPort}`);
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
    const devServer = new WebpackDevServer(compiler, await this.getDevServerConfig(config.devServer));
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

  async getDevServers() {
    if (!this.uiRoot.getDevServers) return [];
    const servers = await this.uiRoot.getDevServers(this.uiRoot);

    return servers.map((server) => {
      return {
        context: [`/preview/${server.context.envRuntime.id}`],
        target: `http://localhost:${server.port}`,
      };
    });
  }

  private async getDevServerConfig(config: any) {
    const devServers = await this.getDevServers();
    const devServerConf = Object.assign(config, {
      proxy: [
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
        // @ts-ignore
      ].concat(devServers),
    });

    return devServerConf;
  }

  static create(props: UIServerProps) {
    return new UIServer(props.graphql, props.express, props.ui, props.uiRoot, props.uiRootExtension, props.logger);
  }
}
