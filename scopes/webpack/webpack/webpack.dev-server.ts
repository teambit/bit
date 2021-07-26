import { DevServer } from '@teambit/bundler';
import { Server } from 'http';
import { Configuration } from 'webpack';
import { Configuration as DevServerConfiguration } from 'webpack-dev-server';

export interface WebpackConfigWithDevServer extends Configuration {
  devServer: DevServerConfiguration;
}
export class WebpackDevServer implements DevServer {
  constructor(private config: WebpackConfigWithDevServer, private webpack, private WsDevServer) {}

  private getCompiler(): any {
    return this.webpack(this.config);
  }

  listen(port: number): Server {
    if (!this.config.devServer) {
      throw new Error('Missing devServer configuration for webpack');
    }
    // Prevent different port between the config port and the listen arg port
    this.config.devServer.port = port;
    // @ts-ignore in the capsules it throws an error about compatibilities issues between webpack.compiler and webpackDevServer/webpack/compiler
    const webpackDs = new this.WsDevServer(this.getCompiler(), this.config.devServer);
    return webpackDs.listen(port);
  }
}
