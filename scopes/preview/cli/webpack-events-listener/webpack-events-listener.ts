import { WebpackAspect, WebpackCompilationDoneEvent, WebpackCompilationStartedEvent } from '@teambit/webpack';
import { PubsubMain, BitBaseEvent } from '@teambit/pubsub';

export type CompilationResult = {
  errors?: Error[];
  warnings?: Error[];
  compiling: boolean;
};

export type Handlers = {
  /**
   * emitted when compilation completes. Might happen after server is already up and running.
   */
  onDone?: (serverId: string, stats: CompilationResult) => void;
  /**
   * happens whenever compilation starts, e.g. when a file changes, or on initial compilation
   */
  onStart?: (serverId: string) => void;
};

/**
 * Listen for Webpack compilation pub sub events.
 */
export function SubscribeToWebpackEvents(pubsub: PubsubMain, handlers: Handlers = {}) {
  pubsub.sub(WebpackAspect.id, (event: BitBaseEvent<any>) => {
    if (event instanceof WebpackCompilationDoneEvent) {
      const { stats, devServerID } = event.data;

      const results = {
        errors: stats.compilation.errors,
        warnings: stats.compilation.warnings,
        compiling: false,
      };

      handlers.onDone?.(devServerID, results);
    }

    if (event instanceof WebpackCompilationStartedEvent) {
      const { devServerID } = event.data;

      handlers.onStart?.(devServerID);
    }
  });
}
