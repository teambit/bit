import { WebpackCompilationStartedEvent } from '../events';
import { WebpackAspect } from '../webpack.aspect';

class WebpackCompilerStartedPlugin {
  pubsub: any;
  devServerID: string;

  constructor({ options }) {
    this.pubsub = options.pubsub;
    this.devServerID = options.devServerID;
  }

  private createEvent = (params: object) => {
    return new WebpackCompilationStartedEvent(Date.now(), params);
  };

  apply(compiler) {
    compiler.hooks.beforeCompile.tapAsync('webpack-compiler-started-plugin', (params: object, callback: Function) => {
      this.pubsub.pub(WebpackAspect.id, this.createEvent(params));
      callback();
    });
  }
}

module.exports = WebpackCompilerStartedPlugin;
