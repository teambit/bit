import { join, resolve } from 'path';
import { existsSync, mkdirpSync } from 'fs-extra';
import { flatten } from 'lodash';
import { ComponentMap } from '@teambit/component';
import { Compiler } from '@teambit/compiler';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { Capsule } from '@teambit/isolator';
import { BuildContext, ComponentResult } from '@teambit/builder';
import { BundlerResult, BundlerContext } from '@teambit/bundler';
import { BundlingStrategy } from '../bundling-strategy';
import { PreviewDefinition } from '../preview-definition';
import { PreviewMain } from '../preview.main.runtime';

/**
 * bundles all components in a given env into the same bundle.
 */
export class EnvBundlingStrategy implements BundlingStrategy {
  name = 'env';

  constructor(private preview: PreviewMain) {}

  async computeTargets(context: BuildContext, previewDefs: PreviewDefinition[]) {
    const outputPath = this.getOutputPath(context);
    if (!existsSync(outputPath)) mkdirpSync(outputPath);

    return [
      {
        entries: await this.computePaths(outputPath, previewDefs, context),
        components: context.components,
        outputPath,
      },
    ];
  }

  async computeResults(context: BundlerContext, results: BundlerResult[]) {
    const result = results[0];

    const componentsResults: ComponentResult[] = result.components.map((component) => {
      return {
        component,
        errors: result.errors.map((err) => (typeof err === 'string' ? err : err.message)),
        warning: result.warnings,
      };
    });

    const artifacts = this.getArtifactDef(context);

    return {
      componentsResults,
      artifacts,
    };
  }

  private getArtifactDef(context: BuildContext) {
    // eslint-disable-next-line @typescript-eslint/prefer-as-const
    const env: 'env' = 'env';
    const rootDir = this.getDirName(context);

    return [
      {
        name: 'preview',
        globPatterns: ['public/**'],
        rootDir,
        context: env,
      },
    ];
  }

  getDirName(context: BuildContext) {
    const envName = context.id.replace('/', '__');
    return `${envName}-preview`;
  }

  private getOutputPath(context: BuildContext) {
    return resolve(`${context.capsuleNetwork.capsulesRootDir}/${this.getDirName(context)}`);
  }

  private getPaths(context: BuildContext, files: AbstractVinyl[], capsule: Capsule) {
    const compiler: Compiler = context.env.getCompiler();
    return files.map((file) => join(capsule.path, compiler.getDistPathBySrcPath(file.relative)));
  }

  private async computePaths(outputPath: string, defs: PreviewDefinition[], context: BuildContext): Promise<string[]> {
    const previewMain = await this.preview.writePreviewRuntime();
    const moduleMapsPromise = defs.map(async (previewDef) => {
      const moduleMap = await previewDef.getModuleMap(context.components);

      const paths = ComponentMap.as(context.components, (component) => {
        const capsule = context.capsuleNetwork.graphCapsules.getCapsule(component.id);
        const maybeFiles = moduleMap.byComponent(component);
        if (!maybeFiles || !capsule) return [];
        const [, files] = maybeFiles;
        const compiledPaths = this.getPaths(context, files, capsule);
        return compiledPaths;
      });

      const template = previewDef.renderTemplatePath ? await previewDef.renderTemplatePath(context) : 'undefined';

      const link = this.preview.writeLink(
        previewDef.prefix,
        paths,
        previewDef.renderTemplatePath ? await previewDef.renderTemplatePath(context) : undefined,
        outputPath
      );

      const files = flatten(paths.toArray().map(([, file]) => file)).concat([link]);

      if (template) return files.concat([template]);
      return files;
    });

    const moduleMaps = await Promise.all(moduleMapsPromise);

    return flatten(moduleMaps.concat([previewMain]));
  }
}
