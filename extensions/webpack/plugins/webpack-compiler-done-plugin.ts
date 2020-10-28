import { WebpackCompilationDoneEvent } from '../events';
import { WebpackAspect } from '../webpack.aspect';

class WebpackCompilerDonePlugin {
  pubsub: any;
  devServerID: string;

  constructor({ options }) {
    this.pubsub = options.pubsub;
    this.devServerID = options.devServerID;
  }

  private createEvent = (stats) => {
    return new WebpackCompilationDoneEvent(Date.now(), stats, this.devServerID);
  };

  apply(compiler) {
    compiler.hooks.done.tap('webpack-compiler-done-plugin', (stats) => {
      this.pubsub.pub(WebpackAspect.id, this.createEvent(stats));
    });
  }
}

module.exports = WebpackCompilerDonePlugin;
