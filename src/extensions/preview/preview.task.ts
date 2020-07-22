import { BuildTask, BuildContext, BuildResults } from '../builder';
import { BundlerExtension, Bundler } from '../bundler';
import { UIRoot } from '../ui';
import CapsuleList from '../isolator/capsule-list';

export class PreviewTask implements BuildTask {
  constructor(private bundler: BundlerExtension, private uiRoot: UIRoot) {}

  extensionId = '@teambit/preview';

  async execute(context: BuildContext): Promise<BuildResults> {
    const bundler: Bundler = await context.env.getBundler(context);

    await bundler.run();
    // const buildOutputs = await Promise.all(promises);

    return {
      components: buildOutputs,
      artifacts: [{ dirName: 'public' }],
    };
  }

  private getEntry(capsules: CapsuleList) {
    capsules.map((capsule) => {});
  }
}
