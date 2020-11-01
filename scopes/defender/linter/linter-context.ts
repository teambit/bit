import { ExecutionContext } from '@teambit/environments';

export interface LinterContext extends ExecutionContext {
  quiet?: boolean;

  /**
   * extensions formats to lint. (e.g. .ts, .tsx, etc.)
   */
  extensionFormats?: string[];
}
