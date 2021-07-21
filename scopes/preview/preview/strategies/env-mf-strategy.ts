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
export class EnvMfBundlingStrategy implements BundlingStrategy {
  name = 'env-mf';

  constructor(private preview: PreviewMain) {}

  async computeTargets(context: BuildContext, previewDefs: PreviewDefinition[]) {
    const outputPath = this.getOutputPath(context);
    console.log('computeTargets');
    console.log('outputPath', outputPath);
    if (!existsSync(outputPath)) mkdirpSync(outputPath);
    const entries = await this.computePaths(outputPath, previewDefs, context);

    return [
      {
        entries,
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

    console.log('componentsResults', componentsResults);
    console.log('artifacts', artifacts);

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
    const previewMain = await this.preview.writePreviewRuntime(context);
    const linkFilesP = defs.map(async (previewDef) => {
      const moduleMap = await previewDef.getModuleMap(context.components);

      const paths = ComponentMap.as(context.components, (component) => {
        const capsule = context.capsuleNetwork.graphCapsules.getCapsule(component.id);
        const maybeFiles = moduleMap.byComponent(component);
        if (!maybeFiles || !capsule) return [];
        const [, files] = maybeFiles;
        const compiledPaths = this.getPaths(context, files, capsule);
        return compiledPaths;
      });

      // const template = previewDef.renderTemplatePath ? await previewDef.renderTemplatePath(context) : 'undefined';

      const link = await this.preview.writeMfLink(
        previewDef.prefix,
        paths,
        previewDef.renderTemplatePath ? await previewDef.renderTemplatePath(context) : undefined,
        outputPath
      );

      // const files = flatten(paths.toArray().map(([, file]) => file)).concat([link]);

      // if (template) return files.concat([template]);
      // return files;
      return link;
    });
    const linkFiles = await Promise.all(linkFilesP);

    const { bootstrapFileName } = this.preview.createBootstrapFile([...linkFiles, previewMain], context);
    const indexEntryPath = this.preview.createIndexEntryFile(bootstrapFileName, context);
    return [indexEntryPath];

    // return flatten(moduleMaps.concat([previewMain]));
  }
}
