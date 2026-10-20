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
   */
  requiresCapsuleInstallation(components: Component[]): boolean {
    return components.some((component) => {
      const scripts = component.state.aspects.get(this.aspectId)?.data?.packageJsonModification?.scripts;
      return PACK_LIFECYCLE_SCRIPTS.some((script) => scripts?.[script]);
    });
  }
}
