import { join, resolve, basename, dirname } from 'path';
import { existsSync, mkdirpSync } from 'fs-extra';
import { Component } from '@teambit/component';
import { ComponentID } from '@teambit/component-id';
import { flatten, isEmpty, chunk } from 'lodash';
import { Compiler } from '@teambit/compiler';
import type { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import type { Capsule } from '@teambit/isolator';
import { CAPSULE_ARTIFACTS_DIR, ComponentResult } from '@teambit/builder';
import type { PkgMain } from '@teambit/pkg';
import { BitError } from '@teambit/bit-error';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import type { BundlerResult, BundlerContext, Asset, BundlerEntryMap, EntriesAssetsMap } from '@teambit/bundler';
import { BundlingStrategy, ComputeTargetsContext } from '../bundling-strategy';
import type { PreviewDefinition } from '../preview-definition';
import type { ComponentPreviewMetaData, PreviewMain } from '../preview.main.runtime';
import { generateComponentLink } from './generate-component-link';
import { PreviewOutputFileNotFound } from '../exceptions';

export const PREVIEW_CHUNK_SUFFIX = 'preview';
export const COMPONENT_CHUNK_SUFFIX = 'component';
export const PREVIEW_CHUNK_FILENAME_SUFFIX = `${PREVIEW_CHUNK_SUFFIX}.js`;
export const COMPONENT_CHUNK_FILENAME_SUFFIX = `${COMPONENT_CHUNK_SUFFIX}.js`;

export const COMPONENT_STRATEGY_SIZE_KEY_NAME = 'size';
export const COMPONENT_STRATEGY_ARTIFACT_NAME = 'preview-component';

type ComponentEntry = {
  component: Component;
  entries: Object;
};
/**
 * bundles all components in a given env into the same bundle.
 */
export class ComponentBundlingStrategy implements BundlingStrategy {
  name = 'component';

  constructor(private preview: PreviewMain, private pkg: PkgMain, private dependencyResolver: DependencyResolverMain) {}

  async computeTargets(context: ComputeTargetsContext, previewDefs: PreviewDefinition[]) {
    const outputPath = this.getOutputPath(context);
    if (!existsSync(outputPath)) mkdirpSync(outputPath);

    // const entriesArr = flatten(
    //   await Promise.all(
    //     context.capsuleNetwork.seedersCapsules.map((capsule) => {
    //       return this.computeComponentEntry(previewDefs, capsule.component, context);
    //     }, {})
    //   )
    // );

    const origComponents = context.capsuleNetwork.originalSeedersCapsules.map((capsule) => capsule.component);

    const entriesArr = await Promise.all(
      origComponents.map((component) => {
        return this.computeComponentEntry(previewDefs, component, context);
      }, {})
    );

    const chunkSize = this.preview.config.maxChunkSize;

    const chunks = chunkSize ? chunk(entriesArr, chunkSize) : [entriesArr];

    const targets = chunks.map((currentChunk) => {
      const entries: BundlerEntryMap = {};
      const components: Component[] = [];
      currentChunk.forEach((entry) => {
        Object.assign(entries, entry.entries);
        components.push(entry.component);
      });

      return {
        entries,
        components,
        outputPath,
      };
    });

    return targets;
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
  }

  async computeComponentEntry(
    previewDefs: PreviewDefinition[],
    component: Component,
    context: ComputeTargetsContext
  ): Promise<ComponentEntry> {
    const path = await this.computePaths(previewDefs, context, component);
    const [componentPath] = this.getPaths(context, component, [component.mainFile]);
    const componentPreviewChunkId = this.getComponentChunkId(component.id, 'preview');

    const entries = {
      [componentPreviewChunkId]: {
        filename: this.getComponentChunkFileName(
          component.id.toString({
            fsCompatible: true,
            ignoreVersion: true,
          }),
          'preview'
        ),
        import: path,
        // dependOn: component.id.toStringWithoutVersion(),
        library: {
          name: componentPreviewChunkId,
          type: 'umd',
        },
      },
    };
    if (context.splitComponentBundle) {
      const componentChunkId = component.id.toStringWithoutVersion();
      entries[componentChunkId] = {
        filename: this.getComponentChunkFileName(
          component.id.toString({
            fsCompatible: true,
            ignoreVersion: true,
          }),
          'component'
        ),
        import: componentPath,
        library: {
          name: componentChunkId,
          type: 'umd',
        },
      };
    }
    return { component, entries };
  }

  private getComponentChunkId(componentId: ComponentID, type: 'component' | 'preview') {
    const id =
      type === 'component'
        ? componentId.toStringWithoutVersion()
        : `${componentId.toStringWithoutVersion()}-${PREVIEW_CHUNK_SUFFIX}`;
    return id;
  }

  private getComponentChunkFileName(idstr: string, type: 'component' | 'preview') {
    const suffix = type === 'component' ? COMPONENT_CHUNK_FILENAME_SUFFIX : PREVIEW_CHUNK_FILENAME_SUFFIX;
    return `${idstr}-${suffix}`;
  }

  private getAssetAbsolutePath(context: BundlerContext, asset: Asset): string {
    const path = this.getOutputPath(context);
    return join(path, 'public', asset.name);
  }

  copyAssetsToCapsules(context: BundlerContext, result: BundlerResult) {
    context.components.forEach((component) => {
      const capsule = context.capsuleNetwork.graphCapsules.getCapsule(component.id);
      if (!capsule) return;
      const files = this.findAssetsForComponent(component, result.assets, result.entriesAssetsMap || {});
      if (!files) return;
      const artifactDirFullPath = join(capsule.path, this.getArtifactDirectory());
      // We don't use the mkdirSync as it uses the capsule fs which uses memfs, which doesn't know to handle nested none existing folders
      mkdirpSync(artifactDirFullPath);

      files.forEach((asset) => {
        const filePath = this.getAssetAbsolutePath(context, asset);
        if (!existsSync(filePath)) {
          throw new PreviewOutputFileNotFound(component.id, filePath);
        }
        const destFilePath = join(artifactDirFullPath, asset.name);
        mkdirpSync(dirname(destFilePath));
        capsule.fs.copyFileSync(filePath, destFilePath);
      });
    });
  }

  // private getCssFileName(componentId: ComponentID): string {
  //   return `${componentId.toString({ ignoreVersion: true, fsCompatible: true })}.css`;
  // }

  private findAssetsForComponent(
    component: Component,
    assets: Asset[],
    entriesAssetsMap: EntriesAssetsMap
  ): Asset[] | undefined {
    if (!assets) return undefined;

    const componentEntryId = component.id.toStringWithoutVersion();
    const componentPreviewEntryId = this.getComponentChunkId(component.id, 'preview');
    const componentFiles = entriesAssetsMap[componentEntryId]?.assets || [];
    const componentAuxiliaryFiles = entriesAssetsMap[componentEntryId]?.auxiliaryAssets || [];
    const componentPreviewFiles = entriesAssetsMap[componentPreviewEntryId]?.assets || [];
    const componentPreviewAuxiliaryFiles = entriesAssetsMap[componentPreviewEntryId]?.auxiliaryAssets || [];

    const files = componentFiles
      .concat(componentAuxiliaryFiles)
      .concat(componentPreviewFiles)
      .concat(componentPreviewAuxiliaryFiles);
    return files;
  }

  private getArtifactDirectory() {
    return join(CAPSULE_ARTIFACTS_DIR, 'preview');
  }

  private computeComponentMetadata(
    context: BundlerContext,
    result: BundlerResult,
    component: Component
  ): ComponentPreviewMetaData {
    const componentEntryId = component.id.toStringWithoutVersion();
    if (!result?.entriesAssetsMap || !result?.entriesAssetsMap[componentEntryId]) {
      return {};
    }
    const files = (result.entriesAssetsMap[componentEntryId]?.assets || []).map((file) => {
      return {
        name: basename(file.name),
        size: file.size,
        compressedSize: file.compressedSize,
      };
    });
    const filesTotalSize = result.entriesAssetsMap[componentEntryId]?.assetsSize || 0;
    const compressedTotalFiles = result.entriesAssetsMap[componentEntryId]?.compressedAssetsSize || 0;
    const assets = (result.entriesAssetsMap[componentEntryId]?.auxiliaryAssets || []).map((file) => {
      return {
        name: basename(file.name),
        size: file.size,
        compressedSize: file.compressedSize,
      };
    });
    const assetsTotalSize = result.entriesAssetsMap[componentEntryId]?.auxiliaryAssetsSize || 0;
    const compressedTotalAssets = result.entriesAssetsMap[componentEntryId]?.compressedAuxiliaryAssetsSize || 0;
    const totalSize = filesTotalSize + assetsTotalSize;
    const compressedTotal = compressedTotalFiles + compressedTotalAssets;

    const metadata = {
      [COMPONENT_STRATEGY_SIZE_KEY_NAME]: {
        files,
        assets,
        totalFiles: filesTotalSize,
        totalAssets: assetsTotalSize,
        total: totalSize,
        compressedTotalFiles,
        compressedTotalAssets,
        compressedTotal,
      },
    };

    return metadata;
  }

  async computeResults(context: BundlerContext, results: BundlerResult[]) {
    const componentsResults = flatten(
      await Promise.all(results.map((result) => this.computeTargetResult(context, result)))
    );

    const artifacts = this.getArtifactDef();

    return {
      componentsResults,
      artifacts,
    };
  }

  async computeTargetResult(context: BundlerContext, result: BundlerResult) {
    if (isEmpty(result.errors)) {
      // In case there are errors files will not be emitted so trying to copy them will fail anyway
      this.copyAssetsToCapsules(context, result);
    }

    const componentsResults: ComponentResult[] = result.components.map((component) => {
      const metadata = this.computeComponentMetadata(context, result, component);
      return {
        component,
        metadata,
        errors: result.errors.map((err) => (typeof err === 'string' ? err : err.message)),
        warning: result.warnings,
        startTime: result.startTime,
        endTime: result.endTime,
      };
    });

    return componentsResults;
  }

  private getArtifactDef() {
    // eslint-disable-next-line @typescript-eslint/prefer-as-const
    // const env: 'env' = 'env';
    // const rootDir = this.getDirName(context);

    return [
      {
        name: COMPONENT_STRATEGY_ARTIFACT_NAME,
        globPatterns: ['**'],
        rootDir: this.getArtifactDirectory(),
        // context: env,
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

  private getPaths(context: ComputeTargetsContext, component: Component, files: AbstractVinyl[]) {
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
    context: ComputeTargetsContext,
    component: Component
  ): Promise<string> {
    // const previewMain = await this.preview.writePreviewRuntime(context);
    const capsule = context.capsuleNetwork.graphCapsules.getCapsule(component.id);
    // if (!capsule) return undefined;
    if (!capsule)
      throw new BitError(
        `could not find capsule for component ${component.id.toString()} during compute paths to bundle`
      );
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
