import webpackDevMiddleware from 'webpack-dev-middleware';
import webpackHotMiddleware from 'webpack-hot-middleware';
import webpack from 'webpack';
import getPort from 'get-port';
import express, { Express } from 'express';
import { devConfig } from './webpack/webpack.dev.config';
import { GraphQLExtension } from '../graphql';
import { ExpressExtension } from '../express';
import { UIExtension } from './ui.extension';
import { UIRoot } from './ui-root';
import { Logger } from '../logger';

export type UIServerProps = {
  graphql: GraphQLExtension;
  express: ExpressExtension;
  ui: UIExtension;
  uiRoot: UIRoot;
  uiRootExtension: string;
  logger: Logger;
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
  async start(dev = false) {
    // const app = this.express.createApp();
    const app = express();
    const port = await this.selectPort();

    if (dev) {
      this.configureWebpackMiddleware(app);
    }

    const server = await this.graphql.createServer({ app });

    server.listen(port);
    this.logger.info(`UI server of ${this.uiRootExtension} is listening to port ${port}`);
  }

  private async selectPort() {
    return getPort({ port: getPort.makeRange(3000, 3200) });
  }

  private async configureWebpackMiddleware(app: Express) {
    const config = await this.getDevConfig();
    const compiler = webpack(config);
    app.use(
      webpackDevMiddleware(compiler, {
        publicPath: config.output.publicPath,
      })
    );

    app.use(
      webpackHotMiddleware(compiler, {
        log: this.logger.info.bind(this.logger),
      })
    );
  }

  static create(props: UIServerProps) {
    return new UIServer(props.graphql, props.express, props.ui, props.uiRoot, props.uiRootExtension, props.logger);
  }
}
