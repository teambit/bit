import type { Compiler } from 'webpack';
import { WebpackCompilationDoneEvent, WebpackCompilationStartedEvent } from '../events';
import { WebpackAspect } from '../webpack.aspect';

const PLUGIN_NAME = 'webpack-compiler-started-plugin';

/**
 * Monitors Webpack's compilation, and updates progress to Bit
 */
export default class WebpackBitReporterPlugin {
  // TODO: add plugin type from webpack and implement it
  pubsub: any;
  devServerID: string;

  constructor({ options }) {
    this.pubsub = options.pubsub;
    this.devServerID = options.devServerID;
  }

  apply(compiler: Compiler) {
    // "Called before a new compilation is created."
    compiler.hooks.compile.tap(PLUGIN_NAME, () => {
      const event = new WebpackCompilationStartedEvent(Date.now(), { devServerID: this.devServerID });
      this.pubsub.pub(WebpackAspect.id, event);
    });

    // "Executed when the compilation has completed."
    compiler.hooks.done.tap(PLUGIN_NAME, (stats) => {
      const event = new WebpackCompilationDoneEvent(Date.now(), stats, this.devServerID);
      this.pubsub.pub(WebpackAspect.id, event);
    });
  }
}
