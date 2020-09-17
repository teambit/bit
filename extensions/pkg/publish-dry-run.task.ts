import { BuildContext, BuiltTaskResult, BuildTask } from '@teambit/builder';
import { Logger } from '@teambit/logger';

import { Publisher } from './publisher';

/**
 * publish build task is running "publish --dry-run" to avoid later npm errors during export
 */
export class PublishDryRunTask implements BuildTask {
  readonly description = 'publish dry-run';
  constructor(readonly id: string, private publisher: Publisher, private logger: Logger) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    this.publisher.options.dryRun = true;
    const capsules = context.capsuleGraph.seedersCapsules;
    const capsulesToPublish = capsules.filter((c) => this.publisher.shouldPublish(c.component.config.extensions));
    this.logger.info(`going to run publish dry-run on ${capsulesToPublish.length} out of ${capsules.length}`);
    const results = await this.publisher.publishMultipleCapsules(capsulesToPublish);
    return {
      componentsResults: results,
      artifacts: [],
    };
  }
}
