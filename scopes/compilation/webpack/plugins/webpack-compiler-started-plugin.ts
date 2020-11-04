import { WebpackCompilationStartedEvent } from '../events';
import { WebpackAspect } from '../webpack.aspect';

class WebpackCompilerStartedPlugin {
  pubsub: any;
  devServerID: string;

  constructor({ options }) {
    this.pubsub = options.pubsub;
    this.devServerID = options.devServerID;
  }

  private createEvent = (context, entry) => {
    return new WebpackCompilationStartedEvent(Date.now(), context, entry);
  };

  apply(compiler) {
    compiler.hooks.entryOption.tap('webpack-compiler-started-plugin', (context, entry) => {
      this.pubsub.pub(WebpackAspect.id, this.createEvent(context, entry));
    });
  }
}

module.exports = WebpackCompilerStartedPlugin;
