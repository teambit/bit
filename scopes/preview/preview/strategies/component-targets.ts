import { join, resolve, basename, dirname } from 'path';
import { existsSync, mkdirpSync } from 'fs-extra';
import { Component } from '@teambit/component';
import { ComponentID } from '@teambit/component-id';
import { flatten, isEmpty, chunk } from 'lodash';
import { Compiler } from '@teambit/compiler';
import type { AbstractVinyl } from '@teambit/component.sources';
import type { Capsule } from '@teambit/isolator';
import { CAPSULE_ARTIFACTS_DIR, ComponentResult } from '@teambit/builder';
import { BitError } from '@teambit/bit-error';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import type { BundlerResult, BundlerContext, Asset, BundlerEntryMap, EntriesAssetsMap, Target } from '@teambit/bundler';
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
  entries: object;
  componentDir: string;
};

type ComputeComponentTargetContext = Pick<
  ComputeTargetsContext,
  'envRuntime' | 'env' | 'envDefinition' | 'id' | 'splitComponentBundle'
>;

type ComputeComponentTargetOptions = Pick<
  Target,
  'outputPath' | 'aliasHostDependencies' | 'externalizeHostDependencies'
>;
/**
 * bundles all components in a given env into the same bundle.
 */
export class ComponentTargets {
  constructor(
    private preview: PreviewMain,
    private dependencyResolver: DependencyResolverMain
  ) {}

  async computeTargets(
    context: ComputeComponentTargetContext,
    components: Component[],
    previewDefs: PreviewDefinition[],
    outputPath: string,
    getComponentDir: (component: Component) => string,
    targetOptions: ComputeComponentTargetOptions
  ): Promise<Target[]> {
    if (!existsSync(outputPath)) mkdirpSync(outputPath);

    const entriesArr = await Promise.all(
      components.map((component) => {
        const componentDir = getComponentDir(component);
        return this.computeComponentEntry(previewDefs, component, context, componentDir);
      }, {})
    );

    const chunkSize = this.preview.config.maxChunkSize;

    const chunks = chunkSize ? chunk(entriesArr, chunkSize) : [entriesArr];

    const peers = await this.dependencyResolver.getPreviewHostDependenciesFromEnv(context.envDefinition.env);

    const targets = chunks.map((currentChunk) => {
      const entries: BundlerEntryMap = {};
      const currChunkComponents: Component[] = [];
      const componentDirectoryMap = {};
      currentChunk.forEach((entry) => {
        Object.assign(entries, entry.entries);
        currChunkComponents.push(entry.component);
        componentDirectoryMap[entry.component.id.toString()] = entry.componentDir;
      });

      return {
        entries,
        components: currChunkComponents,
        componentDirectoryMap,
        hostRootDir: context.envRuntime.envAspectDefinition.aspectPath,
        hostDependencies: peers,
        aliasHostDependencies: true,
        externalizeHostDependencies: true,
        ...targetOptions,
      };
    });

    return targets;
  }

  async computeComponentEntry(
    previewDefs: PreviewDefinition[],
    component: Component,
    context: ComputeComponentTargetContext,
    rootDir: string
  ): Promise<ComponentEntry> {
    const componentPreviewPath = await this.writeComponentPreviewLinkFile(previewDefs, context, component, rootDir);
    const [componentPath] = this.getPaths(context, rootDir, [component.mainFile]);
    const componentDir = rootDir;

    const chunks = {
      componentPreview: this.getComponentChunkId(component.id, 'preview'),
      component: context.splitComponentBundle ? component.id.toStringWithoutVersion() : undefined,
    };

    const entries = {
      [chunks.componentPreview]: {
        filename: this.getComponentChunkFileName(
          component.id.toString({
            fsCompatible: true,
            ignoreVersion: true,
          }),
          'preview'
        ),
        import: componentPreviewPath,
        dependOn: chunks.component,
        library: { name: chunks.componentPreview, type: 'umd' },
      },
    };

    if (chunks.component) {
      entries[chunks.component] = {
        filename: this.getComponentChunkFileName(
          component.id.toString({
            fsCompatible: true,
            ignoreVersion: true,
          }),
          'component'
        ),
        dependOn: undefined,
        import: componentPath,
        library: { name: chunks.component, type: 'umd' },
      };
    }

    return { component, entries, componentDir };
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

  getDirName(context: ComputeComponentTargetContext) {
    const envName = context.id.replace('/', '__');
    return `${envName}-preview`;
  }

  private getPaths(context: ComputeComponentTargetContext, rootDir: string, files: AbstractVinyl[]) {
    const compiler: Compiler = context.env.getCompiler();
    return files.map((file) => join(rootDir, compiler.getDistPathBySrcPath(file.relative)));
  }

  private getComponentOutputPath(rootDir: string, context: ComputeComponentTargetContext) {
    const compiler: Compiler = context.env.getCompiler();
    const distDir = compiler.getDistDir?.() || 'dist';
    return join(resolve(rootDir), distDir);
  }

  private async writeComponentPreviewLinkFile(
    defs: PreviewDefinition[],
    context: ComputeComponentTargetContext,
    component: Component,
    rootDir: string
  ): Promise<string> {
    const moduleMapsPromise = defs.map(async (previewDef) => {
      const moduleMap = await previewDef.getModuleMap([component]);
      const metadata = previewDef.getMetadata ? await previewDef.getMetadata(component) : undefined;
      const maybeFiles = moduleMap.get(component);
      if (!maybeFiles) return { prefix: previewDef.prefix, paths: [] };

      const [, files] = maybeFiles;
      const compiledPaths = this.getPaths(context, rootDir, files);

      return {
        prefix: previewDef.prefix,
        paths: compiledPaths,
        metadata,
      };
    });

    const moduleMaps = await Promise.all(moduleMapsPromise);

    const contents = generateComponentLink(moduleMaps);
    const targetDir = this.getComponentOutputPath(rootDir, context);

    return this.preview.writeLinkContents(contents, targetDir, 'preview');
  }
}
