import { BuildContext, BuiltTaskResult } from '@teambit/builder';
import { Target, BundlerResult, BundlerContext } from '@teambit/bundler';
import type { WebpackConfigTransformer } from '@teambit/webpack';
import { PreviewDefinition } from './preview-definition';
import { PreviewTask } from './preview.task';

export interface BundlingStrategy {
  /**
   * name of the bundling strategy.
   */
  name: string;

  /**
   * compute bundling targets for the build context.
   */
  computeTargets(context: BuildContext, previewDefs: PreviewDefinition[], previewTask: PreviewTask): Promise<Target[]>;

  /**
   * compute the results of the bundler.
   */
  computeResults(context: BundlerContext, results: BundlerResult[], previewTask: PreviewTask): Promise<BuiltTaskResult>;

  getBundlerTransformer?: (context: BundlerContext) => WebpackConfigTransformer[];
}
