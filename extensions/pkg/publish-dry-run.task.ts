import { BuildContext, BuiltTaskResult, BuildTask } from '@teambit/builder';
import { Logger } from '@teambit/logger';
import { Capsule } from '@teambit/isolator';

import { Publisher } from './publisher';
import { Packer } from './packer';

/**
 * publish build task is running "publish --dry-run" to avoid later npm errors during export
 */
export class PublishDryRunTask implements BuildTask {
  readonly description = 'publish dry-run';
  constructor(readonly id: string, private publisher: Publisher, private packer: Packer, private logger: Logger) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    this.publisher.options.dryRun = true;
    const capsules = context.capsuleGraph.seedersCapsules;
    // const capsulesToPublish = capsules.filter((c) => this.publisher.shouldPublish(c.component.config.extensions));
    const capsulesToPublish: Capsule[] = [];
    const capsulesToPack: Capsule[] = [];
    capsules.forEach((c) => {
      const shouldPublish = this.publisher.shouldPublish(c.component.config.extensions);
      if (shouldPublish) {
        capsulesToPublish.push(c);
      } else {
        capsulesToPack.push(c);
      }
    });
    this.logger.info(`going to run publish dry-run on ${capsulesToPublish.length} out of ${capsules.length}`);

    const publishResults = await this.publisher.publishMultipleCapsules(capsulesToPublish);

    this.logger.info(`going to run pack dry-run on ${capsulesToPack.length} out of ${capsules.length}`);
    const packResults = await this.packer.packMultipleCapsules(capsulesToPack, { override: true }, true);
    const packArtifactsDefs = this.packer.getArtifactDefInCapsule();

    return {
      componentsResults: publishResults.concat(packResults),
      artifacts: [packArtifactsDefs],
    };
  }
}
