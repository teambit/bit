import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { BuildContext, BuildTask, BuiltTaskResult, TaskLocation } from '@teambit/builder';
import { Capsule } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import { UIRoot, UiMain } from '@teambit/ui';
import { createBundleHash } from './pre-bundle-utils';
import { buildPreBundlePreview } from './pre-bundle';

export const UIROOT_ASPECT_ID = 'teambit.workspace/workspace';
export const PRE_BUNDLE_PREVIEW_TASK_NAME = 'PreBundlePreview';
export const PRE_BUNDLE_PREVIEW_DIR = 'preview-pre-bundle';
export const PRE_BUNDLE_PREVIEW_HASH_FILENAME = '.hash';

export class PreBundlePreviewTask implements BuildTask {
  aspectId = 'teambit.preview/preview';
  name = PRE_BUNDLE_PREVIEW_TASK_NAME;
  location: TaskLocation = 'end';

  constructor(private ui: UiMain, private logger: Logger) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const capsule: Capsule | undefined = context.capsuleNetwork.seedersCapsules.find(
      (c) => c.component.id.toStringWithoutVersion() === 'teambit.preview/preview'
    );
    if (!capsule) {
      return { componentsResults: [] };
    }

    try {
      const outputPath = join(capsule.path, 'artifacts', PRE_BUNDLE_PREVIEW_DIR);
      this.logger.info(`Generating UI bundle at ${outputPath}...`);
      const [, uiRoot] = this.ui.getUi() as [string, UIRoot];
      const resolvedAspects = await uiRoot.resolveAspects('preview');
      await buildPreBundlePreview(resolvedAspects, outputPath);
      await this.generateHash(outputPath);
    } catch (error) {
      this.logger.error('Generating UI bundle failed', error);
      throw new Error('Generating UI bundle failed');
    }
    const artifacts = [
      {
        name: PRE_BUNDLE_PREVIEW_DIR,
        globPatterns: [`${join('artifacts', PRE_BUNDLE_PREVIEW_DIR)}/**`],
      },
    ];
    return {
      componentsResults: [],
      artifacts,
    };
  }

  private async generateHash(outputPath: string): Promise<void> {
    const maybeUiRoot = this.ui.getUi();
    if (!maybeUiRoot) throw new Error('no uiRoot found');

    const [, uiRoot] = maybeUiRoot;
    const hash = await createBundleHash(uiRoot, 'preview');

    if (!existsSync(outputPath)) mkdirSync(outputPath);
    writeFileSync(join(outputPath, PRE_BUNDLE_PREVIEW_HASH_FILENAME), hash);
  }
}
