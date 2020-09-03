import { DevServer } from '@teambit/bundler';
import { Server } from 'http';
import webpack, { Configuration } from 'webpack';
import WsDevServer from 'webpack-dev-server';

export class WebpackDevServer implements DevServer {
  constructor(private config: Configuration) {}

  private getCompiler() {
    return webpack(this.config);
  }

  listen(port: number): Server {
    const webpackDs = new WsDevServer(this.getCompiler(), this.config.devServer);
    return webpackDs.listen(port);
  }
}
