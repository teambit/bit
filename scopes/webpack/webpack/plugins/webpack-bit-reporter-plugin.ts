import type { Compiler, Stats } from 'webpack';

import { BundlerAspect } from '@teambit/bundler';
import {
  DevServerCompilationStartedEvent,
  DevServerCompilationDoneEvent,
} from '@teambit/preview.cli.dev-server-events-listener';

const PLUGIN_NAME = 'webpack-compiler-started-plugin';

/**
 * Monitors Webpack's compilation, and updates progress to Bit
 */
export class WebpackBitReporterPlugin {
  // TODO: add plugin type from webpack and implement it
  pubsub: any;
  devServerID: string;

  constructor({ options }) {
    this.pubsub = options.pubsub;
    this.devServerID = options.devServerID;
  }

  apply(compiler: Compiler | any) {
    // "Called before a new compilation is created."
    compiler.hooks.compile.tap(PLUGIN_NAME, () => {
      const event = new DevServerCompilationStartedEvent(Date.now(), this.devServerID);
      this.pubsub.pub(BundlerAspect.id, event);
    });

    // "Executed when the compilation has completed."
    compiler.hooks.done.tap(PLUGIN_NAME, (stats: Stats) => {
      const results = {
        errors: stats.compilation.errors,
        warnings: stats.compilation.warnings,
        compiling: false,
      };
      const event = new DevServerCompilationDoneEvent(Date.now(), this.devServerID, results);
      this.pubsub.pub(BundlerAspect.id, event);
    });
  }

  // flag to indicate whether the plugin uses the dev server events or the legacy webpack events
  static readonly USE_DEV_SERVER_EVENTS = true;
}
