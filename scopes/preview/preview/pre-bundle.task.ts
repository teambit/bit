import { join } from 'path';
import type { BuildContext, BuildTask, BuiltTaskResult, TaskLocation } from '@teambit/builder';
import { CAPSULE_ARTIFACTS_DIR } from '@teambit/builder';
import type { Capsule } from '@teambit/isolator';
import type { Logger } from '@teambit/logger';
import type { UIRoot, UiMain } from '@teambit/ui';
import { filterCoreAspectDefs } from '@teambit/aspect-loader';
import { generateBundleHash, getBundleArtifactDef, getAspectIds } from './pre-bundle-utils';
import { RUNTIME_NAME, buildPreBundlePreview } from './pre-bundle';
import { PreviewAspect } from './preview.aspect';

export const BUNDLE_TASK_NAME = 'PreBundlePreview';
export const BUNDLE_DIR = 'ui-bundle';

export class PreBundlePreviewTask implements BuildTask {
  aspectId = PreviewAspect.id;
  name = BUNDLE_TASK_NAME;
  location: TaskLocation = 'end';

  constructor(
    private ui: UiMain,
    private logger: Logger
  ) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const capsule: Capsule | undefined = context.capsuleNetwork.seedersCapsules.find(
      (c) => c.component.id.toStringWithoutVersion() === PreviewAspect.id
    );
    if (!capsule) {
      return { componentsResults: [] };
    }

    try {
      const outputPath = join(capsule.path, CAPSULE_ARTIFACTS_DIR, BUNDLE_DIR);
      this.logger.info(`Generating UI bundle at ${outputPath}...`);
      const [, uiRoot] = this.ui.getUi() as [string, UIRoot];
      // the artifact describes bit, not the workspace it was built in - see `filterCoreAspectDefs`
      const resolvedAspects = filterCoreAspectDefs(await uiRoot.resolveAspects(RUNTIME_NAME));
      this.logger.debug(`PreBundlePreviewTask, aspect ids: ${getAspectIds(resolvedAspects).join(', ')}`);
      await buildPreBundlePreview(resolvedAspects, outputPath);
      // hash the same list that was bundled, so the artifact and its `.hash` cannot disagree
      generateBundleHash(resolvedAspects, outputPath);
    } catch (error) {
      this.logger.error('Generating UI bundle failed', error);
      throw new Error('Generating UI bundle failed');
    }

    return {
      componentsResults: [],
      artifacts: [getBundleArtifactDef(BUNDLE_DIR, '')],
    };
  }
}
