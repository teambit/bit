import { resolve, join } from 'path';
import { ExecutionContext } from '@teambit/envs';
import { BuildContext, BuiltTaskResult, BuildTask, TaskLocation } from '@teambit/builder';
import { Bundler, BundlerContext, BundlerMain, Target } from '@teambit/bundler';
import { Compiler } from '@teambit/compiler';
import { ComponentMap } from '@teambit/component';
import { Capsule } from '@teambit/isolator';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { flatten } from 'lodash';
import { PreviewDefinition } from './preview-definition';
import { PreviewMain } from './preview.main.runtime';

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

  aspectId = 'teambit.preview/preview';
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

  async computePaths(capsule: Capsule, defs: PreviewDefinition[], context: BuildContext): Promise<string[]> {
    const previewMain = await this.preview.writePreviewRuntime();

    const moduleMapsPromise = defs.map(async (previewDef) => {
      const moduleMap = await previewDef.getModuleMap([capsule.component]);
      const paths = this.getPathsFromMap(capsule, moduleMap, context);
      const template = previewDef.renderTemplatePath ? await previewDef.renderTemplatePath(context) : 'undefined';

      const link = this.preview.writeLink(
        previewDef.prefix,
        paths,
        previewDef.renderTemplatePath ? await previewDef.renderTemplatePath(context) : undefined,
        capsule.path
      );

      const files = flatten(paths.toArray().map(([, file]) => file)).concat([link]);

      if (template) return files.concat([template]);
      return files;
    });

    const moduleMaps = await Promise.all(moduleMapsPromise);

    return flatten(moduleMaps.concat([previewMain]));
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
