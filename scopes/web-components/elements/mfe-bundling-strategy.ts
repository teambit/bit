import { BuildContext, BuiltTaskResult } from '@teambit/builder';
import { Target, BundlerResult, BundlerContext } from '@teambit/bundler';

export interface MfeBundlingStrategy {
  /**
   * name of the mfe bundling strategy.
   */
  name: string;

  /**
   * compute bundling targets for the build context.
   */
  computeTargets(context: BuildContext): Promise<Target[]>;

  /**
   * compute the results of the bundler.
   */
  computeResults(context: BundlerContext, results: BundlerResult[]): Promise<BuiltTaskResult>;
}
