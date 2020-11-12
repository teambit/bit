import { BuildContext } from '@teambit/builder';
import { Target, BundlerResult, BundlerContext } from '@teambit/bundler';
import { BundlingStrategy } from '../bundling-strategy';
import { PreviewDefinition } from '../preview-definition';
import { PreviewTask } from '../preview.task';

export class ComponentBundlingStrategy implements BundlingStrategy {
  name = 'component';

  computeTargets(context: BuildContext, previewDefs: PreviewDefinition[], previewTask: PreviewTask): Promise<Target[]> {
    return Promise.all(
      context.capsuleNetwork.graphCapsules.map(async (capsule) => {
        return {
          entries: await previewTask.computePaths(capsule, previewDefs, context),
          components: [capsule.component],
          outputPath: capsule.path,
        };
      })
    );
  }

  async computeResults(context: BundlerContext, results: BundlerResult[], previewTask: PreviewTask) {
    return {
      componentsResults: results.map((result) => {
        return {
          errors: result.errors,
          component: result.components[0],
          warning: result.warnings,
        };
      }),
      artifacts: [{ name: 'preview', globPatterns: [previewTask.getPreviewDirectory(context)] }],
    };
  }
}
