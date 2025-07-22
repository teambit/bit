import { join } from 'path';
import mapSeries from 'p-map-series';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import type { BuildContext, BuildTask, BuiltTaskResult, TaskLocation } from '@teambit/builder';
import { Capsule } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import { UIAspect } from './ui.aspect';
import { UiMain } from './ui.main.runtime';

export const BUNDLE_UI_TASK_NAME = 'BundleUI';
export const BUNDLE_UI_DIR = 'ui-bundle';
export const UIROOT_ASPECT_IDS = {
  SCOPE: 'teambit.scope/scope',
  WORKSPACE: 'teambit.workspace/workspace',
};
export const BUNDLE_UIROOT_DIR = {
  [UIROOT_ASPECT_IDS.SCOPE]: 'scope',
  [UIROOT_ASPECT_IDS.WORKSPACE]: 'workspace',
};
export const BUNDLE_UI_HASH_FILENAME = '.hash';

export class BundleUiTask implements BuildTask {
  aspectId = 'teambit.ui-foundation/ui';
  name = BUNDLE_UI_TASK_NAME;
  location: TaskLocation = 'end';

  constructor(
    private ui: UiMain,
    private logger: Logger
  ) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const capsule: Capsule | undefined = context.capsuleNetwork.seedersCapsules.find(
      (c) => c.component.id.toStringWithoutVersion() === UIAspect.id
    );
    if (!capsule) {
      return { componentsResults: [] };
    }

    try {
      await mapSeries(Object.values(UIROOT_ASPECT_IDS), async (uiRootAspectId) => {
        const outputPath = join(capsule.path, BundleUiTask.getArtifactDirectory(uiRootAspectId));
        this.logger.info(`Generating UI bundle at ${outputPath}...`);
        await this.ui.build(uiRootAspectId, outputPath);
        await this.generateHash(outputPath);
      });
    } catch (error) {
      this.logger.error('Generating UI bundle failed', error);
      throw new Error('Generating UI bundle failed');
    }
    const artifacts = BundleUiTask.getArtifactDef();
    return {
      componentsResults: [],
      artifacts,
    };
  }

  private async generateHash(outputPath: string): Promise<void> {
    const maybeUiRoot = this.ui.getUi();
    if (!maybeUiRoot) throw new Error('no uiRoot found');

    const [, uiRoot] = maybeUiRoot;
    const hash = await this.ui.createBundleUiHash(uiRoot);

    if (!existsSync(outputPath)) mkdirSync(outputPath);
    writeFileSync(join(outputPath, BUNDLE_UI_HASH_FILENAME), hash);
  }

  static getArtifactDirectory(uiRootAspectId) {
    return join('artifacts', BUNDLE_UI_DIR, BUNDLE_UIROOT_DIR[uiRootAspectId]);
  }

  static getArtifactDef() {
    const scopeRootDir = BundleUiTask.getArtifactDirectory(UIROOT_ASPECT_IDS.SCOPE);
    const workspaceRootDir = BundleUiTask.getArtifactDirectory(UIROOT_ASPECT_IDS.WORKSPACE);
    return [
      {
        name: `${BUNDLE_UI_DIR}-${BUNDLE_UIROOT_DIR[UIROOT_ASPECT_IDS.SCOPE]}`,
        globPatterns: [`${scopeRootDir}/**`],
      },
      {
        name: `${BUNDLE_UI_DIR}-${BUNDLE_UIROOT_DIR[UIROOT_ASPECT_IDS.WORKSPACE]}`,
        globPatterns: [`${workspaceRootDir}/**`],
      },
    ];
  }
}
