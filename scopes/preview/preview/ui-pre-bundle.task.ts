import { join } from 'path';
import { CAPSULE_ARTIFACTS_DIR, BuildContext, BuildTask, BuiltTaskResult, TaskLocation } from '@teambit/builder';
import { Logger } from '@teambit/logger';
import { UIAspect, UiMain } from '@teambit/ui';
import { Capsule } from '@teambit/isolator';

export const UI_PRE_BUNDLE_TASK_NAME = 'GenerateUiPreBundle';

export class UiPreBundleTask implements BuildTask {
  aspectId = 'teambit.ui-foundation/ui';
  name = UI_PRE_BUNDLE_TASK_NAME;
  location: TaskLocation = 'start';

  constructor(private ui: UiMain, private logger: Logger) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const capsule: Capsule | undefined = context.capsuleNetwork.seedersCapsules.find(
      (c) => c.component.id.toStringWithoutVersion() === UIAspect.id
    );

    if (!capsule) {
      return { componentsResults: [] };
    }

    const outputPath = join(capsule.path, getArtifactDirectory());

    this.logger.info(`Generating UI pre-bundle at ${outputPath}...`);
    try {
      await this.ui.build(undefined, outputPath);
    } catch (error) {
      this.logger.error('Generating UI pre-bundle failed');
      return {
        componentsResults: [],
      };
    }

    const artifacts = getArtifactDef();

    return {
      componentsResults: [],
      artifacts,
    };
  }
}

export function getArtifactDirectory() {
  return join(CAPSULE_ARTIFACTS_DIR, 'ui-build');
}

export function getArtifactDef() {
  return [
    {
      name: 'ui-build',
      globPatterns: ['**'],
      rootDir: getArtifactDirectory(),
    },
  ];
}
