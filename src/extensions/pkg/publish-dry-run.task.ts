import { BuildContext } from '../builder';
import { BuildTask, BuildResults } from '../builder';
import { Publisher } from './publisher';

/**
 * publish build task is running "publish --dry-run" to avoid later npm errors during export
 */
export class PublishDryRunTask implements BuildTask {
  readonly description = "publish dry-run (to make sure it's possible to publish later)";
  constructor(readonly extensionId: string, private publisher: Publisher) {}

  async execute(context: BuildContext): Promise<BuildResults> {
    this.publisher.options.dryRun = true;
    const capsules = context.capsuleGraph.capsules.getAllCapsules();
    const capsulesToPublish = capsules.filter((c) => this.publisher.shouldPublish(c.component.config.extensions));
    const results = await this.publisher.publishMultipleCapsules(capsulesToPublish);
    return {
      components: results,
      artifacts: [],
    };
  }
}
