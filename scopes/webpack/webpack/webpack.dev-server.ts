import type { DevServer } from '@teambit/bundler';
import type { Server } from 'http';
import type { webpack as webpackCompiler, Configuration } from 'webpack';
import type * as WDS from 'webpack-dev-server';

export interface WebpackConfigWithDevServer extends Configuration {
  devServer: WDS.Configuration;
}
export class WebpackDevServer implements DevServer {
  constructor(
    private config: WebpackConfigWithDevServer,
    private webpack: typeof webpackCompiler,
    private WsDevServer: WDS
  ) {}

  private getCompiler(): any {
    return this.webpack(this.config);
  }

  async listen(port: number): Promise<Server> {
    if (!this.config.devServer) {
      throw new Error('Missing devServer configuration for webpack');
    }
    // Prevent different port between the config port and the listen arg port
    this.config.devServer.port = port;

    // (node:40446) [DEP_WEBPACK_DEV_SERVER_CONSTRUCTOR] DeprecationWarning: Using 'compiler' as the first argument is deprecated. Please use 'options' as the first argument and 'compiler' as the second argument.
    // @ts-ignore in the capsules it throws an error about compatibilities issues between webpack.compiler and webpackDevServer/webpack/compiler
    const webpackDs: WDS = new this.WsDevServer(this.config.devServer, this.getCompiler());
    await webpackDs.start();

    return webpackDs.server;
  }
}
