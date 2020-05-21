import webpack from 'webpack';
import http from 'http';
import socketIO from 'socket.io';
import { join } from 'path';
import WebpackDevServer from 'webpack-dev-server';
import { Environment } from '../environments';
import { Component } from '../component';
import { Workspace } from '../workspace';
import createWebpackConfig from './webpack.config';
import { LogPublisher } from '../logger';

export class ReactEnv implements Environment {
  constructor(private logger: LogPublisher) {}

  dev(workspace: Workspace, components: Component[]) {
    const config = createWebpackConfig(workspace.path, this.getEntries(components));
    const compiler = webpack(config);

    const devSever = new WebpackDevServer(compiler, {
      publicPath: config.output.publicPath,
      hot: true,
      historyApiFallback: true,
      setup(app) {
        const server = new http.Server(app);
        const io = socketIO(server);

        io.on('connection', () => {
          io.sockets.emit(
            'components',
            components.map(component => {
              const docs = component.filesystem.readdirSync('/').filter(path => path.includes('.docs.'))[0];
              return {
                id: component.id.toString(),
                docs: docs
                  ? join(workspace.path, component.state._consumer.componentMap?.getComponentDir(), docs)
                  : null
              };
            })
          );
        });

        server.listen(4000, () => {
          // console.log('listening on *:4000');
        });
      },
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          pathRewrite: { '^/api': '' }
        },
        '/socket.io': {
          target: 'http://localhost:4000',
          ws: true
        }
      }
    });

    devSever.listen(3000, 'localhost', err => {
      if (err) {
        this.logger.error(err);
      }
    });
  }

  build() {}

  serve() {}

  private getEntries(components: Component[]) {
    return components.map(component => {
      const path = join(
        // :TODO check how it works with david. Feels like a side-effect.
        component.state._consumer.componentMap?.getComponentDir(),
        // @ts-ignore
        component.config.main
      );

      return path;
    });
  }
}
