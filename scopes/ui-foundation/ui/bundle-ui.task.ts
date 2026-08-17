import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import type { BuildContext, BuildTask, BuiltTaskResult, TaskLocation } from '@teambit/builder';
import type { Capsule } from '@teambit/isolator';
import type { Logger } from '@teambit/logger';
import { UIAspect } from './ui.aspect';
import type { UiMain } from './ui.main.runtime';

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

    const uiRootAspectIds = Object.values(UIROOT_ASPECT_IDS);
    try {
      // allSettled, not all: `all` rejects as soon as one root fails, and the `finally` below would
      // then close compilers while the other root is still bundling. Wait for both, then report.
      const outcomes = await Promise.allSettled(
        uiRootAspectIds.map(async (uiRootAspectId) => {
          const outputPath = join(capsule.path, BundleUiTask.getArtifactDirectory(uiRootAspectId));
          this.logger.info(`Generating UI bundle at ${outputPath}...`);
          await this.ui.build(uiRootAspectId, outputPath, { deferClose: true });
          await this.generateHash(outputPath);
        })
      );
      const failures = outcomes.flatMap((outcome, index) =>
        outcome.status === 'rejected' ? [{ uiRootAspectId: uiRootAspectIds[index], reason: outcome.reason }] : []
      );
      if (failures.length) {
        // Log every root that failed, not only the one that ends the task. The reason itself is
        // usually rspack's entire stats output - megabytes - so it goes to the log and to `cause`,
        // and the thrown message names the roots, which is what the build pipeline prints.
        failures.forEach(({ uiRootAspectId, reason }) =>
          this.logger.error(`Generating UI bundle failed for ${uiRootAspectId}`, reason)
        );
        const error: any = new Error(
          `Generating UI bundle failed for ${failures.map((failure) => failure.uiRootAspectId).join(', ')}`
        );
        // not `new Error(msg, { cause })`: this project targets es2015, whose lib has no ErrorOptions
        error.cause = failures[0].reason;
        throw error;
      }
    } finally {
      // Free both UI module graphs before the build moves on. Every remaining task - a preview
      // bundle per env among them - runs in this same process, and holding these two graphs is what
      // pushed it into the OOM killer. `deferClose` above is what leaves them for this call, so a
      // compiler is never closed while the other root is still bundling.
      await this.ui.closeBuildCompilers();
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
