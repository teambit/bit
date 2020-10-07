import { BuildContext, BuiltTaskResult, BuildTask, TaskLocation } from '@teambit/builder';
import { Compiler } from '@teambit/compiler';
import { Logger } from '@teambit/logger';
import PackageJsonFile from 'bit-bin/dist/consumer/component/package-json-file';

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

    await this.letCompilersChangePackageJsonBeforePublish(context);

    const results = await this.publisher.publishMultipleCapsules(capsulesToPublish);
    return {
      componentsResults: results,
      artifacts: [],
    };
  }

  async letCompilersChangePackageJsonBeforePublish(context: BuildContext) {
    const compilerInstance: Compiler = context.env.getCompiler();
    if (!compilerInstance) return;
    await Promise.all(
      context.capsuleGraph.seedersCapsules.map(async (capsule) => {
        const packageJson = PackageJsonFile.loadFromCapsuleSync(capsule.path);
        if (!compilerInstance.changePackageJsonBeforePublish) return;
        compilerInstance.changePackageJsonBeforePublish(packageJson.packageJsonObject);
        await packageJson.write();
      })
    );
  }
}
