import { join } from 'path';
import pMapSeries from 'p-map-series';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import type { Capsule } from '@teambit/isolator';
import type { Logger } from '@teambit/logger';
import type { UiMain } from '@teambit/ui';
import {
  UIAspect,
  BUNDLE_UI_DIR,
  BUNDLE_UI_TASK_NAME,
  BUNDLE_UI_HASH_FILENAME,
  KNOWN_UIROOT_ASPECT_IDS,
  getBundleUiArtifactDirectory,
} from '@teambit/ui';
import type { BuildContext, BuildTask, BuiltTaskResult, TaskLocation } from './build-task';

// the task lives here and not in the ui aspect, because the builder aspect registers it and depends on the ui aspect.
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

    const outputPath = join(capsule.path, BundleUiTask.getArtifactDirectory());
    this.logger.info(`Generating UI bundle at ${outputPath}...`);
    // one call, one compilation: `build()` turns every registered UI root into an entry of the same
    // rspack build, so the chunks the roots share are emitted once. there is no second compilation
    // to keep alive, so nothing here has to defer closing it.
    await this.ui.build(undefined, outputPath);
    await this.generateHash(outputPath);

    return {
      componentsResults: [],
      artifacts: BundleUiTask.getArtifactDef(),
    };
  }

  /**
   * One hash file for the whole bundle, mapping each root aspect id to the hash of the aspects that
   * root resolved. `bit start` looks up the root it is about to serve; a root missing from the map
   * (or a bundle built before this layout) reads as "no pre-bundle" and falls back to a local build.
   */
  private async generateHash(outputPath: string): Promise<void> {
    const hashes: Record<string, string> = {};
    // hash exactly the roots that were built. `build()` emits an entry per *registered* root, so
    // walking a hardcoded list instead would both fail where a root is legitimately absent (a
    // scope-only runtime registers just the one) and, worse, record a hash for a root whose
    // document was never emitted - which reads at startup as "a pre-bundle exists" and then 404s.
    const roots = this.ui.getUiRoots().filter(([uiRootAspectId]) => KNOWN_UIROOT_ASPECT_IDS.has(uiRootAspectId));
    await pMapSeries(roots, async ([uiRootAspectId, uiRoot]) => {
      hashes[uiRootAspectId] = await this.ui.createBundleUiHash(uiRoot);
    });

    if (!existsSync(outputPath)) mkdirSync(outputPath, { recursive: true });
    writeFileSync(join(outputPath, BUNDLE_UI_HASH_FILENAME), JSON.stringify(hashes, null, 2));
  }

  static getArtifactDirectory() {
    return getBundleUiArtifactDirectory();
  }

  static getArtifactDef() {
    return [
      {
        name: BUNDLE_UI_DIR,
        globPatterns: [`${BundleUiTask.getArtifactDirectory()}/**`],
      },
    ];
  }
}
