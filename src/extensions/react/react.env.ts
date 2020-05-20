import webpack from 'webpack';
import { join } from 'path';
import WebpackDevServer from 'webpack-dev-server';
import { Environment } from '../environments';
import { Component } from '../component';
import { Workspace } from '../workspace';
import createWebpackConfig from './webpack.config';

export class ReactEnv implements Environment {
  dev(workspace: Workspace, components: Component[]) {
    const config = createWebpackConfig(workspace.path, this.getEntries(components));
    const compiler = webpack(config);

    const devSever = new WebpackDevServer(compiler);
    devSever.listen(3000, 'localhost', err => {
      if (err) {
        return console.log(err);
      }
    });
  }

  build() {}

  serve() {}

  private getEntries(components: Component[]) {
    return components.map(component => {
      const path = join(
        // :TODO check how it works with david. Feels like a side-effect.
        // @ts-ignore
        component.state._consumer.componentMap?.getComponentDir(),
        component.config.main
      );

      return path;
    });
  }
}
