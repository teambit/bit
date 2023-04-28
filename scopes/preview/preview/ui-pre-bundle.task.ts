import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { getAspectDirFromBvm } from '@teambit/aspect-loader';
import { BuildContext, BuildTask, BuiltTaskResult, TaskLocation } from '@teambit/builder';
import { Logger } from '@teambit/logger';
import { UIAspect, UiMain } from '@teambit/ui';
import { Capsule } from '@teambit/isolator';

export const UI_PRE_BUNDLE_TASK_NAME = 'GenerateUiPreBundle';
export const UI_PRE_BUNDLE_DIR = 'ui-build';
export const UI_PRE_BUNDLE_HASH_FILENAME = '.hash';

export class UiPreBundleTask implements BuildTask {
  aspectId = 'teambit.ui-foundation/ui';
  name = UI_PRE_BUNDLE_TASK_NAME;
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
    this.logger.info(`Generating prebundled ui-build at ${outputPath}...`);
    try {
      await this.ui.build(undefined, outputPath);
      await this.generateHash(outputPath);
    } catch (error) {
      this.logger.error('Generating prebundled ui-build failed');
      throw new Error('Generating prebundled ui-build failed');
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
    const hash = await this.ui.buildUiHash(uiRoot);

    if (!existsSync(outputPath)) mkdirSync(outputPath);
    writeFileSync(join(outputPath, UI_PRE_BUNDLE_HASH_FILENAME), hash);
  }
}

export function getArtifactDirectory() {
  return join('artifacts', UI_PRE_BUNDLE_DIR);
}

export function getArtifactDef() {
  return [
    {
      name: UI_PRE_BUNDLE_DIR,
      globPatterns: ['**'],
      rootDir: getArtifactDirectory(),
    },
  ];
}

export function getPreBundleHash() {
  const uiPreBundlePathFromBvm = getPreBundlePath();
  if (existsSync(uiPreBundlePathFromBvm)) {
    return readFileSync(join(uiPreBundlePathFromBvm, '.hash')).toString();
  }
  return '';
}

export function getPreBundlePath() {
  const uiPathFromBvm = getAspectDirFromBvm(UIAspect.id);
  return join(uiPathFromBvm, getArtifactDirectory());
}
