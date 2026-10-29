import type { BuildContext, BuiltTaskResult, BuildTask, TaskLocation } from '@teambit/builder';
import type { Logger } from '@teambit/logger';
import type { Packer } from './packer';
import { Extensions } from '@teambit/legacy.constants';
import type { Component } from '@teambit/component';

const PACK_LIFECYCLE_SCRIPTS = ['prepack', 'prepare', 'postpack'];

/**
 * pack components to a .tgz file
 */
export class PackTask implements BuildTask {
  readonly name = 'PackComponents';
  readonly description = 'Packing components into a .tgz file';
  readonly location: TaskLocation = 'end';
  readonly dependencies = [Extensions.typescript];
  constructor(
    readonly aspectId: string,
    private packer: Packer,
    private logger: Logger
  ) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const capsules = context.capsuleNetwork.seedersCapsules;
    this.logger.info(`going to run pack on ${capsules.length} capsules`);
    const packResults = await this.packer.packMultipleCapsules(capsules, { override: true }, false, true);
    const packArtifactsDefs = this.packer.getArtifactDefInCapsule();

    return {
      componentsResults: packResults,
      artifacts: [packArtifactsDefs],
    };
  }

  /**
   * packing needs the packages when it runs the pack lifecycle scripts of the package.json, or when it bundles
   * dependencies (taken from node_modules).
   * the package.json written to the capsule comes from the pkg config, the component overrides and, when the
   * artifacts are reused, the package.json of the last build (which includes the env transformations).
   */
  requiresCapsuleInstallation(components: Component[]): boolean {
    return components.some((component) => {
      const legacyComponent = component.state._consumer;
      const pkgJsonOfLastBuild = legacyComponent.extensions
        .findExtension(Extensions.builder)
        ?.data?.aspectsData?.find((aspectData) => aspectData.aspectId === this.aspectId)?.data?.pkgJson;
      const pkgJsonSources: Array<Record<string, any> | undefined> = [
        component.state.aspects.get(this.aspectId)?.data?.packageJsonModification,
        legacyComponent.overrides?.componentOverridesPackageJsonData,
        pkgJsonOfLastBuild,
      ];
      return pkgJsonSources.some(
        (pkgJson) =>
          PACK_LIFECYCLE_SCRIPTS.some((script) => pkgJson?.scripts?.[script]) ||
          hasBundledDependencies(pkgJson?.bundledDependencies) ||
          hasBundledDependencies(pkgJson?.bundleDependencies)
      );
    });
  }
}

/**
 * the value is either a list of package names or `true` to bundle all of them.
 */
function hasBundledDependencies(bundledDependencies: unknown): boolean {
  return Array.isArray(bundledDependencies) ? bundledDependencies.length > 0 : Boolean(bundledDependencies);
}
