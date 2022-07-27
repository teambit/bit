import { resolve, join } from 'path';
import { ExecutionContext } from '@teambit/envs';
import { BuildContext, BuiltTaskResult, BuildTask, TaskLocation, CAPSULE_ARTIFACTS_DIR } from '@teambit/builder';
import { Bundler, BundlerContext, BundlerMain, Target } from '@teambit/bundler';
import { Compiler } from '@teambit/compiler';
import { ComponentMap } from '@teambit/component';
import { Capsule } from '@teambit/isolator';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import { PreviewMain } from './preview.main.runtime';

export const PREVIEW_TASK_NAME = 'GeneratePreview';
export class PreviewTask implements BuildTask {
  constructor(
    /**
     * bundler extension.
     */
    private bundler: BundlerMain,

    /**
     * preview extension.
     */
    private preview: PreviewMain,

    private dependencyResolver: DependencyResolverMain,
    private logger: Logger
  ) {}

  aspectId = 'teambit.preview/preview';
  name = PREVIEW_TASK_NAME;
  location: TaskLocation = 'end';
  // readonly dependencies = [CompilerAspect.id];

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const defs = this.preview.getDefs();
    const url = `/preview/${context.envRuntime.id}`;
    const bundlingStrategy = this.preview.getBundlingStrategy(context.env);
    const envPreviewConfig = this.preview.getEnvPreviewConfig(context.env);
    const splitComponentBundle = envPreviewConfig.splitComponentBundle ?? false;
    const computeTargetsContext = Object.assign(context, { splitComponentBundle });

    const targets: Target[] = await bundlingStrategy.computeTargets(computeTargetsContext, defs, this);

    const bundlerContext: BundlerContext = Object.assign(context, {
      targets,
      compress: bundlingStrategy.name !== 'env' && splitComponentBundle,
      entry: [],
      publicPath: this.getPreviewDirectory(context),
      rootPath: url,
      development: context.dev,
      metaData: {
        initiator: `${PREVIEW_TASK_NAME} task`,
        envId: context.id,
      },
    });

    const bundler: Bundler = await context.env.getBundler(bundlerContext);
    const bundlerResults = await bundler.run();

    const results = bundlingStrategy.computeResults(bundlerContext, bundlerResults, this);
    return results;
  }

  getLinkFileDirectory() {
    return join(CAPSULE_ARTIFACTS_DIR, 'preview-links');
  }

  getPreviewDirectory(context: ExecutionContext) {
    const outputPath = resolve(`${context.id}/public`);
    return outputPath;
  }

  getPathsFromMap(
    capsule: Capsule,
    moduleMap: ComponentMap<AbstractVinyl[]>,
    context: BuildContext
  ): ComponentMap<string[]> {
    const compiler: Compiler = context.env.getCompiler(context);
    return moduleMap.map((files) => {
      return files.map((file) => join(capsule.path, compiler.getDistPathBySrcPath(file.relative)));
    });
  }
}
