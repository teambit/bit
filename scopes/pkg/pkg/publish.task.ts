import type { BuildContext, BuiltTaskResult, BuildTask, TaskLocation } from '@teambit/builder';
import type { Logger } from '@teambit/logger';
import type { Capsule } from '@teambit/isolator';
import type { Publisher } from './publisher';

/**
 * publish components by running "npm publish"
 */
export class PublishTask implements BuildTask {
  readonly name = 'PublishComponents';
  readonly location: TaskLocation = 'end';
  constructor(
    readonly aspectId: string,
    private publisher: Publisher,
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

    return {
      componentsResults: publishResults,
      artifacts: [],
    };
  }
}
