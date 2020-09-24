import { WebpackCompilationDoneEvent } from '../events';
import { WebpackAspect } from '../webpack.aspect';

class WebpackCompilerDonePlugin {
  pubsub: any;

  constructor({ options }) {
    this.pubsub = options.pubsub;
  }

  private createEvent = () => {
    return new WebpackCompilationDoneEvent(Date.now());
  };

  apply(compiler) {
    // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
    compiler.hooks.done.tap('webpack-compiler-done-plugin', (_stats) => {
      this.pubsub.pub(WebpackAspect.id, this.createEvent());
    });
  }
}

module.exports = WebpackCompilerDonePlugin;
