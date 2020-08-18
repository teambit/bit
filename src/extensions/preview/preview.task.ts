import { join } from 'path';
import { BuildTask, BuildContext, BuildResults } from '../builder';
import { BundlerExtension, Bundler, BundlerContext, Target } from '../bundler';
import { ComponentMap } from '../component';
import { PreviewExtension } from './preview.extension';
import { PreviewDefinition } from './preview-definition';
import { Capsule } from '../isolator';
import { AbstractVinyl } from '../../consumer/component/sources';
import { Compiler } from '../compiler';

export class PreviewTask implements BuildTask {
  constructor(
    /**
     * bundler extension.
     */
    private bundler: BundlerExtension,

    /**
     * preview extension.
     */
    private preview: PreviewExtension
  ) {}

  extensionId = '@teambit/preview';

  async execute(context: BuildContext): Promise<BuildResults> {
    const defs = this.preview.getDefs();
    const capsules = context.capsuleGraph.capsules;
    const url = `/preview/${context.envRuntime.id}`;

    const targets: Target[] = await Promise.all(
      capsules.map(async ({ capsule }) => {
        return {
          entries: await this.makeEntries(capsule, defs, context),
          capsule,
        };
      })
    );

    const bundlerContext: BundlerContext = Object.assign(context, {
      targets,
      entry: [],
      publicPath: this.getPreviewDirectory(),
      rootPath: url,
    });

    const bundler: Bundler = await context.env.getBundler(bundlerContext);
    const componentResults = await bundler.run();

    return {
      components: componentResults,
      // TODO: @guy rename to `preview` instead of `public`.
      artifacts: [{ dirName: this.getPreviewDirectory() }],
    };
  }

  getPreviewDirectory() {
    // TODO: @guy please make sure to wire it to a config as above.
    return 'public';
  }

  private async makeEntries(capsule: Capsule, defs: PreviewDefinition[], context: BuildContext) {
    const previewLinks = await Promise.all(
      defs.map(async (previewDef) => {
        const moduleMap = await previewDef.getModuleMap([capsule.component]);
        const modulePaths = this.getPathsFromMap(capsule, moduleMap, context);

        return {
          name: previewDef.prefix,
          modulePaths,
          templatePath: await previewDef.renderTemplatePath?.(context),
        };
      })
    );

    // if needed, could write to the capsule's /dist dir
    // i.e. join(capsule.path, 'dist', `__${random()}`);
    const entryPath = this.preview.writeLinks(previewLinks);

    return [require.resolve('./preview.runtime'), entryPath];
  }

  private getPathsFromMap(
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
