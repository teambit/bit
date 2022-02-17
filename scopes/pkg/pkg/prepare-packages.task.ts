import { BuildContext, BuiltTaskResult, BuildTask } from '@teambit/builder';
import { EnvsMain } from '@teambit/envs';
import { Logger } from '@teambit/logger';
import { writeNpmIgnore } from './write-npm-ignore';

/**
 * prepare packages for publishing.
 */
export class PreparePackagesTask implements BuildTask {
  readonly name = 'PreparePackages';
  readonly location = 'end';
  constructor(readonly aspectId: string, private logger: Logger, private envs: EnvsMain) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    await this.writeNpmIgnoreFile(context);
    const result = {
      componentsResults: [],
    };

    return result;
  }

  private async writeNpmIgnoreFile(context: BuildContext) {
    await Promise.all(
      context.capsuleNetwork.seedersCapsules.map(async (capsule) => {
        await writeNpmIgnore(capsule, this.envs);
      })
    );
  }
}
