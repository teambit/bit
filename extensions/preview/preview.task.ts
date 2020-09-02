import { BuildContext, BuildResults, BuildTask } from '@teambit/builder';
import { Bundler, BundlerContext, BundlerMain, Target } from '@teambit/bundler';
import { Compiler } from '@teambit/compiler';
import { ComponentMap } from '@teambit/component';
import { Capsule } from '@teambit/isolator';
import { AbstractVinyl } from 'bit-bin/dist/consumer/component/sources';
import { flatten } from 'lodash';
import { join } from 'path';

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

  extensionId = 'teambit.bit/preview';

  async execute(context: BuildContext): Promise<BuildResults> {
    const defs = this.preview.getDefs();
    const capsules = context.capsuleGraph.capsules;
    const url = `/preview/${context.envRuntime.id}`;

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

  private async computePaths(capsule: Capsule, defs: PreviewDefinition[], context: BuildContext): Promise<string[]> {
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

  getPreviewDirectory() {
    // TODO: @guy please make sure to wire it to a config as above.
    return 'public';
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
