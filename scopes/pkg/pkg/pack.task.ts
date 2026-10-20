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
   * packing runs the pack lifecycle scripts of the package.json, which might need the packages.
   * the scripts of the package.json written to the capsule come from the pkg config, the component overrides and,
   * when the artifacts are reused, the package.json of the last build (which includes the env transformations).
   */
  requiresCapsuleInstallation(components: Component[]): boolean {
    return components.some((component) => {
      const legacyComponent = component.state._consumer;
      const pkgJsonOfLastBuild = legacyComponent.extensions
        .findExtension(Extensions.builder)
        ?.data?.aspectsData?.find((aspectData) => aspectData.aspectId === this.aspectId)?.data?.pkgJson;
      const scriptsSources = [
        component.state.aspects.get(this.aspectId)?.data?.packageJsonModification?.scripts,
        legacyComponent.overrides?.componentOverridesPackageJsonData?.scripts,
        pkgJsonOfLastBuild?.scripts,
      ];
      return scriptsSources.some((scripts) => PACK_LIFECYCLE_SCRIPTS.some((script) => scripts?.[script]));
    });
  }
}
