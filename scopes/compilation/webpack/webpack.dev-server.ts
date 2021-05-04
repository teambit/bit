import { DevServer } from '@teambit/bundler';
import { Server } from 'http';
import webpack, { Configuration } from 'webpack';
import WsDevServer, { Configuration as DevServerConfiguration } from 'webpack-dev-server';

export interface WebpackConfigWithDevServer extends Configuration {
  devServer: DevServerConfiguration;
}
export class WebpackDevServer implements DevServer {
  constructor(private config: WebpackConfigWithDevServer) {}

  private getCompiler() {
    return webpack(this.config);
  }

  listen(port: number): Server {
    // Prevent different port between the config port and the listen arg port
    this.config.devServer.port = port;
    // @ts-ignore in the capsules it throws an error about compatibilities issues between webpack.compiler and webpackDevServer/webpack/compiler
    const webpackDs = new WsDevServer(this.getCompiler(), this.config.devServer);
    return webpackDs.listen(port);
  }
}
