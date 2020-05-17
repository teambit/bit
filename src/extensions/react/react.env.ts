import webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import { Environment } from '../environments';
import { Component } from '../component';
import createWebpackConfig from './webpack.config';

export class ReactEnv implements Environment {
  dev(components: Component[]) {
    const config = createWebpackConfig('/Users/ranmizrahi/Bit/react-new-project', ['components/test/index.js']);
    console.log(config);
    const compiler = webpack(config);
    console.log(compiler);

    const devSever = new WebpackDevServer(compiler);
    devSever.listen(3000, 'localhost', err => {
      if (err) {
        return console.log(err);
      }
    });
  }

  build() {}

  serve() {}
}
