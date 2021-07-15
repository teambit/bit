import { resolve } from 'path';
import { ExecutionContext } from '@teambit/envs';
import { BuildContext, BuiltTaskResult, BuildTask, TaskLocation } from '@teambit/builder';
import { Bundler, BundlerContext, BundlerMain, Target } from '@teambit/bundler';
import { PreviewMain } from './preview.main.runtime';
import { PreviewAspect } from './preview.aspect';

export class PreviewTask implements BuildTask {
  constructor(
    /**
     * bundler extension.
     */
    private bundler: BundlerMain,

    /**
     * preview extension.
     */
    private preview: PreviewMain
  ) {}

  aspectId = PreviewAspect.id;
  name = 'GeneratePreview';
  location: TaskLocation = 'end';

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const defs = this.preview.getDefs();
    const url = `/preview/${context.envRuntime.id}`;
    const bundlingStrategy = this.preview.getBundlingStrategy();

    const targets: Target[] = await bundlingStrategy.computeTargets(context, defs, this);

    const bundlerContext: BundlerContext = Object.assign(context, {
      targets,
      entry: [],
      publicPath: this.getPreviewDirectory(context),
      rootPath: url,
    });

    const bundler: Bundler = await context.env.getBundler(bundlerContext);
    const bundlerResults = await bundler.run();

    return bundlingStrategy.computeResults(bundlerContext, bundlerResults, this);
  }

  getPreviewDirectory(context: ExecutionContext) {
    const outputPath = resolve(`${context.id}/public`);
    return outputPath;
  }
}
