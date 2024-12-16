import { join } from 'path';
import { BuildContext, BuildTask, BuiltTaskResult, CAPSULE_ARTIFACTS_DIR, TaskLocation } from '@teambit/builder';
import { Capsule } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import { UIRoot, UiMain } from '@teambit/ui';
import { generateBundleHash, getBundleArtifactDef } from './pre-bundle-utils';
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
      const resolvedAspects = await uiRoot.resolveAspects(RUNTIME_NAME);
      await buildPreBundlePreview(resolvedAspects, outputPath);
      await this.generateHash(outputPath);
    } catch (error) {
      this.logger.error('Generating UI bundle failed', error);
      throw new Error('Generating UI bundle failed');
    }

    return {
      componentsResults: [],
      artifacts: [getBundleArtifactDef(BUNDLE_DIR, '')],
    };
  }

  private async generateHash(outputPath: string): Promise<void> {
    const maybeUiRoot = this.ui.getUi();
    if (!maybeUiRoot) throw new Error('no uiRoot found');

    const [, uiRoot] = maybeUiRoot;
    await generateBundleHash(uiRoot, RUNTIME_NAME, outputPath);
  }
}
