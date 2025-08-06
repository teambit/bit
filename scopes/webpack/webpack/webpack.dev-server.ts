import { join } from 'path';
import type { DevServer } from '@teambit/bundler';
import findRoot from 'find-root';
import type { Server } from 'http';
import type { webpack as webpackCompiler, Configuration } from 'webpack';
import type * as WDS from 'webpack-dev-server';
import { inspect } from 'util';
import { WebpackAspect } from './webpack.aspect';

//@ts-ignore - ignoring ts errors here because WDS.Configuration is a complex type that might break
// between versions, leads to errors such as:
// error TS2430: Interface 'WebpackConfigWithDevServer' incorrectly extends interface 'Configuration'.
export interface WebpackConfigWithDevServer extends Configuration {
  devServer: WDS.Configuration;
  favicon?: string;
}
export class WebpackDevServer implements DevServer {
  private readonly WsDevServer: typeof WDS;
  constructor(
    private config: WebpackConfigWithDevServer,
    private webpack: typeof webpackCompiler,
    /**
     * path to the webpack-dev-server module or instance of webpack-dev-server.
     * this accept getting an instance for backward compatibility.
     */
    private webpackDevServer: string | typeof WDS
  ) {
    if (typeof this.webpackDevServer === 'string') {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      this.WsDevServer = require(this.webpackDevServer);
    } else {
      this.WsDevServer = this.webpackDevServer;
    }
  }

  private getCompiler(): any {
    return this.webpack(this.config as any);
  }

  id = WebpackAspect.id;

  displayName = 'Webpack dev server';

  version(): string {
    if (typeof this.webpackDevServer !== 'string') {
      return 'unknown';
    }
    // Resolve version from the webpack-dev-server package.json
    try {
      const root = findRoot(this.webpackDevServer);
      const packageJsonPath = join(root, 'package.json');
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const packageJson = require(packageJsonPath);
      return packageJson.version;
    } catch {
      return 'unknown';
    }
  }

  displayConfig(): string {
    return inspect(this.config, { depth: 10 });
  }

  async listen(port: number): Promise<Server> {
    if (!this.config.devServer) {
      throw new Error('Missing devServer configuration for webpack');
    }
    // Prevent different port between the config port and the listen arg port
    this.config.devServer.port = port;

    // Adding signal listeners to make sure we immediately close the process on sigint / sigterm (otherwise webpack dev server closing will take time)
    this.addSignalListener();

    // Compatibility check for Webpack dev server v3 (e.g. for Angular v8)
    if (typeof (this.WsDevServer as any).addDevServerEntrypoints !== 'undefined') {
      const webpackDs = new (this.WsDevServer as any)(this.getCompiler(), this.config.devServer);
      return webpackDs.listen(port);
    }

    // @ts-expect-error in the capsules it throws an error about compatibilities issues between webpack.compiler and webpackDevServer/webpack/compiler
    const webpackDs: WDS = new this.WsDevServer(this.config.devServer, this.getCompiler());
    await webpackDs.start();

    // @ts-expect-error
    return webpackDs.server;
  }

  private addSignalListener() {
    process.on('SIGTERM', () => {
      process.exit();
    });

    process.on('SIGINT', () => {
      process.exit();
    });
  }
}
