import { join, resolve } from 'path';
import { existsSync, mkdirpSync } from 'fs-extra';
import { flatten } from 'lodash';
import { ComponentMap } from '@teambit/component';
import { Compiler } from '@teambit/compiler';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { Capsule } from '@teambit/isolator';
import { ComponentResult } from '@teambit/builder';
import { BundlerContext, BundlerHtmlConfig, BundlerResult } from '@teambit/bundler';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { PkgMain } from '@teambit/pkg';
import type { BundlingStrategy, ComputeTargetsContext } from '../bundling-strategy';
import { PreviewDefinition } from '../preview-definition';
import { PreviewMain } from '../preview.main.runtime';
import { html } from '../bundler/html-template';

export const ENV_STRATEGY_ARTIFACT_NAME = 'preview';

/**
 * bundles all components in a given env into the same bundle.
 */
export class EnvBundlingStrategy implements BundlingStrategy {
  name = 'env';

  constructor(private preview: PreviewMain, private pkg: PkgMain, private dependencyResolver: DependencyResolverMain) {}

  async computeTargets(context: ComputeTargetsContext, previewDefs: PreviewDefinition[]) {
    const outputPath = this.getOutputPath(context);
    if (!existsSync(outputPath)) mkdirpSync(outputPath);
    const htmlConfig = this.generateHtmlConfig({ dev: context.dev });
    const peers = await this.dependencyResolver.getPreviewHostDependenciesFromEnv(context.envDefinition.env);

    return [
      {
        entries: await this.computePaths(outputPath, previewDefs, context),
        html: [htmlConfig],
        components: context.components,
        outputPath,
        /* It's a path to the root of the host component. */
        // hostRootDir, handle this
        hostDependencies: peers,
        aliasHostDependencies: true,
      },
    ];
  }

  private generateHtmlConfig(options: { dev?: boolean }): BundlerHtmlConfig {
    const config = {
      title: 'Preview',
      templateContent: html('Preview'),
      cache: false,
      minify: options?.dev ?? true,
    };
    return config;
  }

  async computeResults(context: BundlerContext, results: BundlerResult[]) {
    const result = results[0];

    const componentsResults: ComponentResult[] = result.components.map((component) => {
      return {
        component,
        errors: result.errors.map((err) => (typeof err === 'string' ? err : err.message)),
        warning: result.warnings,
        startTime: result.startTime,
        endTime: result.endTime,
      };
    });

    const artifacts = this.getArtifactDef(context);

    return {
      componentsResults,
      artifacts,
    };
  }

  private getArtifactDef(context: ComputeTargetsContext) {
    // eslint-disable-next-line @typescript-eslint/prefer-as-const
    const env: 'env' = 'env';
    const rootDir = this.getDirName(context);

    return [
      {
        name: ENV_STRATEGY_ARTIFACT_NAME,
        globPatterns: ['public/**'],
        rootDir,
        context: env,
      },
    ];
  }

  getDirName(context: ComputeTargetsContext) {
    const envName = context.id.replace('/', '__');
    return `${envName}-preview`;
  }

  private getOutputPath(context: ComputeTargetsContext) {
    return resolve(`${context.capsuleNetwork.capsulesRootDir}/${this.getDirName(context)}`);
  }

  private getPaths(context: ComputeTargetsContext, files: AbstractVinyl[], capsule: Capsule) {
    const compiler: Compiler = context.env.getCompiler();
    return files.map((file) => join(capsule.path, compiler.getDistPathBySrcPath(file.relative)));
  }

  private async computePaths(
    outputPath: string,
    defs: PreviewDefinition[],
    context: ComputeTargetsContext
  ): Promise<string[]> {
    const previewMain = await this.preview.writePreviewRuntime(context);
    const moduleMapsPromise = defs.map(async (previewDef) => {
      const moduleMap = await previewDef.getModuleMap(context.components);

      const paths = ComponentMap.as(context.components, (component) => {
        const capsule = context.capsuleNetwork.graphCapsules.getCapsule(component.id);
        const maybeFiles = moduleMap.get(component);
        if (!maybeFiles || !capsule) return [];
        const [, files] = maybeFiles;
        const compiledPaths = this.getPaths(context, files, capsule);
        return compiledPaths;
      });

      const template = previewDef.renderTemplatePath ? await previewDef.renderTemplatePath(context) : 'undefined';

      const link = this.preview.writeLink(
        previewDef.prefix,
        paths,
        {default: template || 'undefined'},
        outputPath,
        false
      );

      const files = flatten(paths.toArray().map(([, file]) => file)).concat([link]);

      if (template) return files.concat([template]);
      return files;
    });

    const moduleMaps = await Promise.all(moduleMapsPromise);

    return flatten(moduleMaps.concat([previewMain]));
  }
}
