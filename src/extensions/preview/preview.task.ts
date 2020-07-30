import { join } from 'path';
import { flatten } from 'lodash';
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

    const targets: Target[] = await Promise.all(
      capsules.map(async ({ capsule }) => {
        return {
          entries: await this.computePaths(capsule, defs, context),
          capsule,
        };
      })
    );

    const bundlerContext: BundlerContext = Object.assign(context, {
      targets,
      entry: [],
    });

    const bundler: Bundler = await context.env.getBundler(bundlerContext);
    const componentResults = await bundler.run();

    return {
      components: componentResults,
      // TODO: @guy rename to `preview` instead of `public`.
      artifacts: [{ dirName: 'public' }],
    };
  }

  getPreviewDirectory() {
    // TODO: @guy please make sure to wire it to a config as above.
    return 'public';
  }

  private async computePaths(capsule: Capsule, defs: PreviewDefinition[], context: BuildContext): Promise<string[]> {
    const previewMain = require.resolve('./preview.runtime');
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

      const files = paths
        .toArray()
        .flatMap(([, file]) => file)
        .concat([link]);

      if (template) return files.concat([template]);
      return files;
    });

    const moduleMaps = await Promise.all(moduleMapsPromise);

    return flatten(moduleMaps.concat([previewMain]));
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
