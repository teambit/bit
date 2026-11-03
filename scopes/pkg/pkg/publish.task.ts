import type { BuildContext, BuiltTaskResult, BuildTask, TaskLocation } from '@teambit/builder';
import type { Logger } from '@teambit/logger';
import type { Capsule } from '@teambit/isolator';
import type { Component } from '@teambit/component';
import type { Publisher } from './publisher';
import {
  PACK_LIFECYCLE_SCRIPTS,
  PUBLISH_LIFECYCLE_SCRIPTS,
  packageJsonRequiresInstallation,
} from './package-json-requires-installation';

/**
 * publish components by running "npm publish"
 */
export class PublishTask implements BuildTask {
  readonly name = 'PublishComponents';
  readonly description = 'Publishing components to the package registry';
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

  /**
   * normally, it publishes the tarball created by the PackComponents task. without a tarball (e.g. the pack task was
   * skipped), it publishes the capsule dir, which runs the pack and publish lifecycle scripts and bundles dependencies.
   */
  requiresCapsuleInstallation(components: Component[]): boolean {
    return packageJsonRequiresInstallation(components, this.aspectId, [
      ...PACK_LIFECYCLE_SCRIPTS,
      ...PUBLISH_LIFECYCLE_SCRIPTS,
    ]);
  }
}
