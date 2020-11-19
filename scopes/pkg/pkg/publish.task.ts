import { BuildContext, BuiltTaskResult, BuildTask, TaskLocation } from '@teambit/builder';
import { Logger } from '@teambit/logger';
import { Capsule } from '@teambit/isolator';
import { Publisher } from './publisher';
import { Packer } from './packer';

/**
 * publish components by running "npm publish"
 */
export class PublishTask implements BuildTask {
  readonly name = 'PublishComponents';
  readonly location: TaskLocation = 'end';
  constructor(
    readonly aspectId: string,
    private publisher: Publisher,
    private packer: Packer,
    private logger: Logger
  ) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    this.publisher.options.dryRun = false;
    const capsules = context.capsuleNetwork.seedersCapsules;
    // const capsulesToPublish = capsules.filter((c) => this.publisher.shouldPublish(c.component.config.extensions));
    const capsulesToPublish: Capsule[] = [];
    capsules.forEach((c) => {
      const shouldPublish = this.publisher.shouldPublish(c.component.config.extensions);
      if (shouldPublish) {
        capsulesToPublish.push(c);
      }
    });
    this.logger.info(`going to run publish on ${capsulesToPublish.length} out of ${capsules.length}`);

    const publishResults = await this.publisher.publishMultipleCapsules(capsulesToPublish);
    this.logger.info(`going to run pack dry-run on ${capsules.length} out of ${capsules.length}`);

    const packResults = await this.packer.packMultipleCapsules(capsules, { override: true }, false, true);
    const packArtifactsDefs = this.packer.getArtifactDefInCapsule();

    return {
      componentsResults: publishResults.concat(packResults),
      artifacts: [packArtifactsDefs],
    };
  }
}
