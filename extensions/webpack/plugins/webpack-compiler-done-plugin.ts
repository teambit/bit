import type { webpackCompilationDoneEvent } from '../events';
import { WebpackAspect } from '../webpack.aspect';

class WebpackCompilerDonePlugin {
  pubsub: any;
  devServer: any;

  constructor({ options }) {
    this.pubsub = options.pubsub;
    this.devServer = options.devServer;
  }

  private createEvent: () => webpackCompilationDoneEvent = () => {
    return {
      type: 'webpack-compilation-done',
      version: '0.0.1',
      timestamp: new Date().getTime().toString(),
      body: {
        uiServer: this.devServer,
      },
    };
  };

  apply(compiler) {
    compiler.hooks.done.tap('webpack-compiler-done-plugin', () =>
      // stats /* stats is passed as an argument when done hook is tapped.  */
      {
        this.pubsub.publishToTopic(WebpackAspect.id, this.createEvent());
      }
    );
  }
}

module.exports = WebpackCompilerDonePlugin;
