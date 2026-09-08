import { join } from 'path';
import type { BuildContext, BuildTask, BuiltTaskResult, TaskHandler, TaskLocation } from '@teambit/builder';
import { bundleCli } from '@teambit/harmony.modules.cli-bundler';

export const BIT_COMPONENT_ID = 'teambit.harmony/bit';
export const BUNDLE_TASK_NAME = 'BundleCliApp';

/**
 * Produces the bundled CLI as part of `@teambit/bit`'s own build.
 *
 * This is the difference between the bundled distribution and today's: instead of shipping ~680
 * packages and letting node stitch them together at require time, `@teambit/bit` carries one
 * pre-linked bundle plus the shims that make every core aspect still importable as
 * `@teambit/<aspect>`.
 *
 * The task deliberately holds no bundling logic - it lives in
 * `@teambit/harmony.modules.cli-bundler`, shared verbatim with `npm run bundle` so the artefact CI
 * publishes and the one a developer builds locally can never drift.
 */
export type BundleCliAppTaskOptions = {
  /** also build a node single executable alongside the script bundle */
  sea?: boolean;
  /** include the UI/preview bundling externals - see the bundler's `externals.ts` */
  uiBundling?: boolean;
};

export class BundleCliAppTask implements BuildTask {
  // `Pipeline` would default this to the env id anyway; declaring it satisfies `BuildTask` and keeps
  // the task attributable when it is used outside a pipeline.
  readonly aspectId = 'teambit.harmony/envs/bit-cli-app-env';
  readonly name = BUNDLE_TASK_NAME;
  readonly description = 'bundle the bit cli and generate the core aspect shims';
  /**
   * 'end': the bundler reads every core aspect's compiled `dist`, so every seeder must have run its
   * compiler first.
   */
  readonly location: TaskLocation = 'end';

  constructor(private readonly options: BundleCliAppTaskOptions = {}) {}

  /** the `Pipeline` contract: a named handler that builds the task once the env context exists */
  static from(options: BundleCliAppTaskOptions = {}): TaskHandler {
    return {
      name: BUNDLE_TASK_NAME,
      handler: () => new BundleCliAppTask(options),
    };
  }

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const capsule = context.capsuleNetwork.seedersCapsules.find(
      (c) => c.component.id.toStringWithoutVersion() === BIT_COMPONENT_ID
    );
    // the env is only meant for `@teambit/bit`, but a pipeline can be invoked for any subset of
    // components; without the main capsule there is nothing to bundle and that is not an error.
    if (!capsule) return { componentsResults: [] };

    const coreAspectIds = this.readCoreAspectIds(capsule.path);
    const result = await bundleCli({
      // the capsule is the installation to bundle: its node_modules holds the freshly compiled
      // core aspects, which is exactly what should ship - not whatever the building bit runs from.
      packagesRoot: capsule.path,
      coreAspectIds,
      // the capsule *is* the package that gets published, so build the distribution into it directly
      // rather than into a subdirectory that something would later have to lift out. `inPlace` also
      // stops the bundler cleaning the out dir - which here holds the component's own sources and
      // compiled dist - and merges into the real package.json instead of writing a stand-in.
      outDir: capsule.path,
      inPlace: true,
      sea: this.options.sea,
      uiBundling: this.options.uiBundling,
    });

    return {
      componentsResults: [
        {
          component: capsule.component,
          metadata: {
            bundleSizeMb: result.bundleSizeMb,
            coreAspects: result.coreAspects,
            typeFiles: result.typeFiles,
            shimsWithTypes: result.shimsWithTypes,
            externals: result.externalsInstalled,
            warnings: result.warnings,
          },
          errors: result.errors ? [`the cli bundle reported ${result.errors} esbuild errors`] : [],
        },
      ],
    };
  }

  /**
   * Read the ids out of the capsule being built rather than importing them.
   *
   * `manifests.ts` is the single source of truth for what a core aspect is, and it lives in the
   * component this task is building. Importing it would make the env depend on `@teambit/bit`, i.e.
   * on the thing it builds; reading the compiled copy keeps the list correct *for this build*
   * without that cycle.
   */
  private readCoreAspectIds(capsulePath: string): string[] {
    const manifestsPath = join(capsulePath, 'dist', 'manifests.js');
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const manifests = require(manifestsPath);
    if (typeof manifests.getAllCoreAspectsIds !== 'function') {
      throw new Error(`[${BUNDLE_TASK_NAME}] ${manifestsPath} does not export getAllCoreAspectsIds`);
    }
    return manifests.getAllCoreAspectsIds();
  }
}
