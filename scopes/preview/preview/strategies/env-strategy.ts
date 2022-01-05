import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { existsSync, mkdirpSync } from 'fs-extra';
import { Component } from '@teambit/component';
import { flatten } from 'lodash';
import { Compiler } from '@teambit/compiler';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { Capsule } from '@teambit/isolator';
import { BuildContext, ComponentResult } from '@teambit/builder';
import { PkgMain } from '@teambit/pkg';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { BundlerResult, BundlerContext, Asset } from '@teambit/bundler';
import { BundlingStrategy } from '../bundling-strategy';
import { PreviewDefinition } from '../preview-definition';
import { PreviewMain } from '../preview.main.runtime';
import { generateComponentLink } from './generate-component-link';

export const PREVIEW_CHUNK_SUFFIX = 'preview';
export const COMPONENT_CHUNK_SUFFIX = 'component';
export const PREVIEW_CHUNK_FILENAME_SUFFIX = `${PREVIEW_CHUNK_SUFFIX}.js`;
export const COMPONENT_CHUNK_FILENAME_SUFFIX = `${COMPONENT_CHUNK_SUFFIX}.js`;

type ComponentPreviewMetaData = {
  size?: Number;
};
/**
 * bundles all components in a given env into the same bundle.
 */
export class EnvBundlingStrategy implements BundlingStrategy {
  name = 'env';

  constructor(private preview: PreviewMain, private pkg: PkgMain, private dependencyResolver: DependencyResolverMain) {}

  async computeTargets(context: BuildContext, previewDefs: PreviewDefinition[]) {
    const outputPath = this.getOutputPath(context);
    if (!existsSync(outputPath)) mkdirpSync(outputPath);

    // const entriesArr = flatten(
    //   await Promise.all(
    //     context.capsuleNetwork.seedersCapsules.map((capsule) => {
    //       return this.computeComponentEntry(previewDefs, capsule.component, context);
    //     }, {})
    //   )
    // );

    const entriesArr = await Promise.all(
      context.capsuleNetwork.seedersCapsules.map((capsule) => {
        return this.computeComponentEntry(previewDefs, capsule.component, context);
      }, {})
    );

    const entries = entriesArr.reduce((entriesMap, entry) => {
      // entriesMap[entry.library.name] = entry;
      Object.assign(entriesMap, entry);
      return entriesMap;
    }, {});
    console.log('entries', JSON.stringify(entries, null, 2));
    // const entries = entriesArr.reduce((entriesMap, entry) => {
    //   entriesMap[entry.library.name] = entry;
    //   return entriesMap;
    // }, {});

    // const modules = await Promise.all(entriesArr.map(async (entry) => {
    //   const dependencies = await this.dependencyResolver.getDependencies(entry.component);
    //   const manifest = dependencies.toDependenciesManifest();
    //   const peer = Object.entries(manifest.peerDependencies || {}).reduce((acc, [packageName, version]) => {
    //     acc[packageName] = {
    //       singleton: true,
    //       requiredVersion: version
    //     };

    //     return acc;
    //   }, {});
    //   // console.log(entry);
    //   return {
    //     name: entry.library.name,
    //     exposes: {
    //       '.': entry.import || ''
    //     },
    //     shared: {
    //       ...manifest.dependencies,
    //       ...peer
    //     },
    //   };
    // }));

    return [
      {
        // entries: await this.computePaths(outputPath, previewDefs, context),
        entries,
        components: context.components,
        outputPath,
        // modules,
      },
    ];
  }

  async computeComponentEntry(previewDefs: PreviewDefinition[], component: Component, context: BuildContext) {
    const path = await this.computePaths(previewDefs, context, component);
    const [componentPath] = this.getPaths(context, component, [component.mainFile]);
    const componentChunkId = component.id.toStringWithoutVersion();
    const componentPreviewChunkId = `${component.id.toStringWithoutVersion()}-${PREVIEW_CHUNK_SUFFIX}`;

    return {
      [componentChunkId]: {
        filename: `${component.id.toString({
          fsCompatible: true,
          ignoreVersion: true,
        })}-${COMPONENT_CHUNK_FILENAME_SUFFIX}`,
        import: componentPath,
        library: {
          name: componentChunkId,
          type: 'umd',
        },
      },
      [componentPreviewChunkId]: {
        filename: `${component.id.toString({
          fsCompatible: true,
          ignoreVersion: true,
        })}-${PREVIEW_CHUNK_FILENAME_SUFFIX}`,
        import: path,
        dependOn: component.id.toStringWithoutVersion(),
        library: {
          // name: this.pkg.getPackageName(component),
          name: componentPreviewChunkId,
          type: 'umd',
        },
      },
    };
  }

  private getAssetAbsolutePath(context: BundlerContext, asset: Asset): string {
    const path = this.getOutputPath(context);
    return join(path, 'public', asset.name);
  }

  copyAssetsToCapsules(context: BundlerContext, result: BundlerResult) {
    context.components.forEach((component) => {
      const capsule = context.capsuleNetwork.graphCapsules.getCapsule(component.id);
      if (!capsule) return;
      const files = this.findAssetsForComponent(component, result.assets);
      if (!files) return;
      console.log('copyAssetsToCapsules files', files);

      files.forEach((asset) => {
        const filePath = this.getAssetAbsolutePath(context, asset);
        const contents = readFileSync(filePath);
        const exists = capsule.fs.existsSync(this.getArtifactDirectory());
        if (!exists) capsule.fs.mkdirSync(this.getArtifactDirectory());
        let filename = asset.name;
        if (filePath.endsWith('.css'))
          filename = `${capsule.component.id.toString({ ignoreVersion: true, fsCompatible: true })}.css`;
        capsule.fs.writeFileSync(join(this.getArtifactDirectory(), filename), contents);
      });
    });
  }

  private findAssetsForComponent(component: Component, assets: Asset[]): Asset[] | undefined {
    if (!assets) return undefined;
    console.log('copyAssetsToCapsules assets', assets);

    const files = assets.filter((asset) => {
      const fsComp = component.id.toString({ ignoreVersion: true, fsCompatible: true });
      const id = component.id.toStringWithoutVersion();
      return asset.name.includes(fsComp) || asset.name.includes(id);
    });
    return files;
  }

  private getArtifactDirectory() {
    return `preview`;
  }

  private computeComponentMetadata(
    context: BundlerContext,
    result: BundlerResult,
    component: Component
  ): ComponentPreviewMetaData {
    const files = this.findAssetsForComponent(component, result.assets);
    const componentFile = files?.find((file) => {
      return file.name.endsWith(COMPONENT_CHUNK_FILENAME_SUFFIX);
    });
    if (!componentFile) return {};
    return {
      size: componentFile.size,
    };
  }

  async computeResults(context: BundlerContext, results: BundlerResult[]) {
    const result = results[0];

    this.copyAssetsToCapsules(context, result);

    const componentsResults: ComponentResult[] = result.components.map((component) => {
      const metadata = this.computeComponentMetadata(context, result, component);
      console.log('metadata', component.id.toString(), metadata);
      return {
        component,
        metadata,
        errors: result.errors.map((err) => (typeof err === 'string' ? err : err.message)),
        warning: result.warnings,
        startTime: result.startTime,
        endTime: result.endTime,
      };
    });

    const artifacts = this.getArtifactDef();

    return {
      componentsResults,
      artifacts,
    };
  }

  private getArtifactDef() {
    // eslint-disable-next-line @typescript-eslint/prefer-as-const
    // const env: 'env' = 'env';
    // const rootDir = this.getDirName(context);

    return [
      {
        name: 'preview',
        globPatterns: [`${this.getArtifactDirectory()}/**`],
        // rootDir,
        // context: env,
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

  private getPaths(context: BuildContext, component: Component, files: AbstractVinyl[]) {
    const capsule = context.capsuleNetwork.graphCapsules.getCapsule(component.id);
    if (!capsule) return [];
    const compiler: Compiler = context.env.getCompiler();
    return files.map((file) => join(capsule.path, compiler.getDistPathBySrcPath(file.relative)));
  }

  private getComponentOutputPath(capsule: Capsule) {
    return resolve(`${capsule.path}`);
  }

  private async computePaths(
    defs: PreviewDefinition[],
    context: BuildContext,
    component: Component
  ): Promise<string | undefined> {
    // const previewMain = await this.preview.writePreviewRuntime(context);
    const capsule = context.capsuleNetwork.graphCapsules.getCapsule(component.id);
    if (!capsule) return undefined;
    const moduleMapsPromise = defs.map(async (previewDef) => {
      const moduleMap = await previewDef.getModuleMap([component]);
      const maybeFiles = moduleMap.get(component);
      if (!maybeFiles || !capsule) return [];
      const [, files] = maybeFiles;
      const compiledPaths = this.getPaths(context, component, files);
      // const files = flatten(paths.toArray().map(([, file]) => file));

      return {
        prefix: previewDef.prefix,
        paths: compiledPaths,
      };
    });

    const moduleMaps = flatten(await Promise.all(moduleMapsPromise));

    const contents = generateComponentLink(moduleMaps);
    return this.preview.writeLinkContents(contents, this.getComponentOutputPath(capsule), 'preview');
    // return flatten(moduleMaps);
  }
}
