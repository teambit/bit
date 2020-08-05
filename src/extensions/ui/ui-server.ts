import webpackDevMiddleware from 'webpack-dev-middleware';
import webpack from 'webpack';
import getPort from 'get-port';
import { Express } from 'express';
import { devConfig } from './webpack/webpack.dev.config';
import { GraphQLExtension } from '../graphql';
import { ExpressExtension } from '../express';
import { UIExtension } from './ui.extension';
import { UIRoot } from './ui-root';

export type UIServerProps = {
  graphql: GraphQLExtension;
  express: ExpressExtension;
  ui: UIExtension;
  uiRoot: UIRoot;
  uiRootExtension: string;
};

export class UIServer {
  constructor(
    private graphql: GraphQLExtension,
    private express: ExpressExtension,
    private ui: UIExtension,
    private uiRoot: UIRoot,
    private uiRootExtension: string
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
  async listen(dev = true) {
    const app = this.express.createApp();

    if (dev) {
      this.configureWebpackMiddleware(app);
    }

    const server = await this.graphql.createServer({ app });
    server.listen(await this.selectPort());
  }

  private async selectPort() {
    return getPort({ port: getPort.makeRange(3000, 3200) });
  }

  private async configureWebpackMiddleware(app: Express) {
    const config = await this.getDevConfig();
    const compiler = webpack(config);
    app.use(webpackDevMiddleware(compiler, config.devServer));
  }

  static create(props: UIServerProps) {
    return new UIServer(props.graphql, props.express, props.ui, props.uiRoot, props.uiRootExtension);
  }
}
