import { BuildContext, BuiltTaskResult, BuildTask, TaskLocation } from '@teambit/builder';
import { Logger } from '@teambit/logger';
import { Packer } from './packer';

/**
 * pack components to a .tgz file
 */
export class PackTask implements BuildTask {
  readonly name = 'PackComponents';
  readonly location: TaskLocation = 'end';
  constructor(readonly aspectId: string, private packer: Packer, private logger: Logger) {}

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
}
