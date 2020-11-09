import { Stats } from 'webpack';

import { WebpackCompilationDoneEvent, WebpackCompilationError, WebpackCompilationWarnings } from '../events';
import { WebpackAspect } from '../webpack.aspect';

class WebpackCompilerDonePlugin {
  pubsub: any;
  devServerID: string;

  constructor({ options }) {
    this.pubsub = options.pubsub;
    this.devServerID = options.devServerID;
  }

  private createEvent = (stats: Stats) => {
    const statsAsJson: Stats.ToJsonOutput = stats.toJson();
    const webpackCompilationErrors: WebpackCompilationError[] = stats.compilation.errors.map((err) => ({
      message: err.message,
      stack: err.stack,
    }));

    const webpackCompilationWarnings: WebpackCompilationWarnings[] = stats.compilation.warnings.map((warning) => ({
      message: warning.message,
      stack: warning.stack,
    }));

    return new WebpackCompilationDoneEvent(
      Date.now().toString(),
      this.devServerID,
      webpackCompilationErrors,
      webpackCompilationWarnings,
      statsAsJson.hash || ''
    );
  };

  apply(compiler) {
    compiler.hooks.done.tap('webpack-compiler-done-plugin', (stats: Stats) => {
      const event = this.createEvent(stats);
      this.pubsub.pub(WebpackAspect.id, event);
    });
  }
}

module.exports = WebpackCompilerDonePlugin;
