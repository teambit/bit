import { BuildContext } from '../builder';
import { BuildTask, BuildResults } from '../builder';
import { Publisher } from './publisher';
import { LogPublisher } from '../types';

/**
 * publish build task is running "publish --dry-run" to avoid later npm errors during export
 */
export class PublishDryRunTask implements BuildTask {
  readonly description = 'publish dry-run';
  constructor(readonly extensionId: string, private publisher: Publisher, private logger: LogPublisher) {}

  async execute(context: BuildContext): Promise<BuildResults> {
    this.publisher.options.dryRun = true;
    const capsules = context.capsuleGraph.capsules.getAllCapsules();
    const capsulesToPublish = capsules.filter((c) => this.publisher.shouldPublish(c.component.config.extensions));
    this.logger.info(
      'dry-run',
      `going to run publish dry-run on ${capsulesToPublish.length} out of ${capsules.length}`
    );
    const results = await this.publisher.publishMultipleCapsules(capsulesToPublish);
    return {
      components: results,
      artifacts: [],
    };
  }
}
