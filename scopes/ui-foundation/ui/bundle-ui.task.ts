import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { getAspectDirFromBvm } from '@teambit/aspect-loader';
import { BuildContext, BuildTask, BuiltTaskResult, TaskLocation } from '@teambit/builder';
import { Capsule } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import { UIAspect, UiMain } from '@teambit/ui';

export const BUNDLE_UI_TASK_NAME = 'BundleUI';
export const BUNDLE_UI_DIR = 'ui-bundle';
export const BUNDLE_UI_HASH_FILENAME = '.hash';

export class BundleUiTask implements BuildTask {
  aspectId = 'teambit.ui-foundation/ui';
  name = BUNDLE_UI_TASK_NAME;
  location: TaskLocation = 'end';

  constructor(private ui: UiMain, private logger: Logger) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const capsule: Capsule | undefined = context.capsuleNetwork.seedersCapsules.find(
      (c) => c.component.id.toStringWithoutVersion() === UIAspect.id
    );
    if (!capsule) {
      return { componentsResults: [] };
    }

    const outputPath = join(capsule.path, getArtifactDirectory());
    this.logger.info(`Generating UI bundle at ${outputPath}...`);
    try {
      await this.ui.build(undefined, outputPath);
      await this.generateHash(outputPath);
    } catch (error) {
      this.logger.error('Generating UI bundle failed');
      throw new Error('Generating UI bundle failed');
    }
    const artifacts = getArtifactDef();
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
}

export function getArtifactDirectory() {
  return join('artifacts', BUNDLE_UI_DIR);
}

export function getArtifactDef() {
  return [
    {
      name: BUNDLE_UI_DIR,
      globPatterns: ['**'],
      rootDir: getArtifactDirectory(),
    },
  ];
}

export function getBundleUiHash() {
  const bundleUiPathFromBvm = getBundleUiPath();
  if (existsSync(bundleUiPathFromBvm)) {
    return readFileSync(join(bundleUiPathFromBvm, '.hash')).toString();
  }
  return '';
}

export function getBundleUiPath() {
  const uiPathFromBvm = getAspectDirFromBvm(UIAspect.id);
  return join(uiPathFromBvm, getArtifactDirectory());
}
