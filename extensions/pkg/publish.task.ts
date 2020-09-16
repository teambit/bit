import { BuildContext, BuiltTaskResult, BuildTask, TaskLocation } from '@teambit/builder';
import { Logger } from '@teambit/logger';

import { Publisher } from './publisher';

/**
 * publish components by running "npm publish"
 */
export class PublishTask implements BuildTask {
  readonly description = 'publish components';
  readonly location: TaskLocation = 'end';
  constructor(readonly id: string, private publisher: Publisher, private logger: Logger) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    this.publisher.options.dryRun = false;
    const capsules = context.capsuleGraph.seedersCapsules;
    const capsulesToPublish = capsules.filter((c) => this.publisher.shouldPublish(c.component.config.extensions));
    this.logger.info(`going to run publish on ${capsulesToPublish.length} out of ${capsules.length}`);
    const results = await this.publisher.publishMultipleCapsules(capsulesToPublish);
    return {
      componentsResults: results,
      artifacts: [],
    };
  }
}
