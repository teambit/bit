import { BuildContext, BuiltTaskResult, BuildTask } from '@teambit/builder';
import { Logger } from '@teambit/logger';
import { Capsule } from '@teambit/isolator';
import { Publisher } from './publisher';
import { Packer } from './packer';

/**
 * publish build task is running "publish --dry-run" to avoid later npm errors during export
 */
export class PublishDryRunTask implements BuildTask {
  readonly name = 'PublishDryRun';
  readonly location = 'end';
  dependencies: string[];
  constructor(
    readonly aspectId: string,
    private publisher: Publisher,
    private packer: Packer,
    private logger: Logger
  ) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    this.publisher.options.dryRun = true;
    const capsules = context.capsuleNetwork.seedersCapsules;
    // const capsulesToPublish = capsules.filter((c) => this.publisher.shouldPublish(c.component.config.extensions));
    const capsulesToPublish: Capsule[] = [];
    capsules.forEach((c) => {
      const shouldPublish = this.publisher.shouldPublish(c.component.config.extensions);
      if (shouldPublish) {
        capsulesToPublish.push(c);
      }
    });
    this.logger.info(`going to run publish dry-run on ${capsulesToPublish.length} out of ${capsules.length}`);

    const publishResults = await this.publisher.publishMultipleCapsules(capsulesToPublish);

    this.logger.info(`going to run pack dry-run on ${capsules.length} out of ${capsules.length}`);
    const packResults = await this.packer.packMultipleCapsules(capsules, { override: true }, true, true);

    return {
      componentsResults: publishResults.concat(packResults),
      artifacts: [],
    };
  }
}
