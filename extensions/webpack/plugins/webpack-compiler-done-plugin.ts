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

  /* stats is passed as an argument when done hook is tapped.  */
  apply(compiler) {
    compiler.hooks.done.tap('webpack-compiler-done-plugin', (stats) => {
      this.pubsub.pub(WebpackAspect.id, this.createEvent());
    });
  }
}

module.exports = WebpackCompilerDonePlugin;
