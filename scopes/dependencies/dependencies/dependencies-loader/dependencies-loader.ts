import path from 'path';
import { uniq } from 'lodash';
import { IssuesClasses } from '@teambit/component-issues';
import { getLastModifiedComponentTimestampMs, getLastModifiedPathsTimestampMs } from '@teambit/toolbox.fs.last-modified';
import { ExtensionDataEntry } from '@teambit/legacy.extension-data';
import { DependencyLoaderOpts, ConsumerComponent as Component } from '@teambit/legacy.consumer-component';
import { COMPONENT_CONFIG_FILE_NAME } from '@teambit/legacy.constants';
import { Workspace } from '@teambit/workspace';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { DevFilesMain } from '@teambit/dev-files';
import { Logger } from '@teambit/logger';
import { AspectLoaderMain } from '@teambit/aspect-loader';
import { DependenciesData } from './dependencies-data';
import { updateDependenciesVersions } from './dependencies-versions-resolver';
import { AutoDetectDeps, DebugDependencies } from './auto-detect-deps';
import OverridesDependencies from './overrides-dependencies';
import { ApplyOverrides } from './apply-overrides';

export class DependenciesLoader {
  private idStr: string;
  constructor(
    private component: Component,
    private depsResolver: DependencyResolverMain,
    private devFiles: DevFilesMain,
    private aspectLoader: AspectLoaderMain,
    private logger: Logger
  ) {
    this.idStr = this.component.id.toString();
  }
  async load(workspace: Workspace, opts: DependencyLoaderOpts) {
    const { dependenciesData, debugDependenciesData } = await this.getDependenciesData(workspace, opts);
    const applyOverrides = new ApplyOverrides(this.component, this.depsResolver, this.logger, workspace);
    applyOverrides.allDependencies = dependenciesData.allDependencies;
    applyOverrides.allPackagesDependencies = dependenciesData.allPackagesDependencies;
    if (debugDependenciesData) {
      // if it's coming from the cache, it's empty
      applyOverrides.debugDependenciesData = debugDependenciesData;
    }
    applyOverrides.issues = dependenciesData.issues;
    const results = await applyOverrides.getDependenciesData();
    this.setDependenciesDataOnComponent(results.dependenciesData, results.overridesDependencies);
    await updateDependenciesVersions(
      this.depsResolver,
      workspace,
      this.component,
      results.overridesDependencies,
      results.autoDetectOverrides,
      applyOverrides.debugDependenciesData.components,
      opts.resolveExtensionsVersions
    );

    return {
      dependenciesData: results.dependenciesData,
      overridesDependencies: results.overridesDependencies,
      debugDependenciesData: applyOverrides.debugDependenciesData,
    };
  }

  async loadFromScope(dependenciesData: Partial<DependenciesData>) {
    const applyOverrides = new ApplyOverrides(this.component, this.depsResolver, this.logger);
    const { allDependencies, allPackagesDependencies, issues } = dependenciesData;
    if (allDependencies) applyOverrides.allDependencies = allDependencies;
    if (allPackagesDependencies) applyOverrides.allPackagesDependencies = allPackagesDependencies;
    if (issues) applyOverrides.issues = issues;
    const results = await applyOverrides.getDependenciesData();
    this.setDependenciesDataOnComponent(results.dependenciesData, results.overridesDependencies);
  }

  private async getDependenciesData(
    workspace: Workspace,
    opts: DependencyLoaderOpts
  ): Promise<{
    dependenciesData: DependenciesData;
    debugDependenciesData?: DebugDependencies;
  }> {
    const depsDataFromCache = await this.getDependenciesDataFromCacheIfPossible(workspace, opts);
    if (depsDataFromCache) {
      return { dependenciesData: depsDataFromCache };
    }

    const autoDetectDeps = new AutoDetectDeps(
      this.component,
      workspace,
      this.devFiles,
      this.depsResolver,
      this.aspectLoader
    );
    const results = await autoDetectDeps.getDependenciesData(opts.cacheResolvedDependencies, opts.cacheProjectAst);
    if (this.shouldSaveInCache(results.dependenciesData, opts.storeInFsCache)) {
      await workspace.consumer.componentFsCache.saveDependenciesDataInCache(
        this.idStr,
        results.dependenciesData.serialize()
      );
    }

    return results;
  }

  private async getDependenciesDataFromCacheIfPossible(
    workspace: Workspace,
    opts: DependencyLoaderOpts
  ): Promise<DependenciesData | null> {
    if (!opts.useDependenciesCache) {
      return null;
    }
    const cacheData = await workspace.consumer.componentFsCache.getDependenciesDataFromCache(this.idStr);
    if (!cacheData) {
      return null; // probably the first time, so it wasn't entered to the cache yet.
    }
    const rootDir = this.component.componentMap?.getComponentDir();
    if (!rootDir) {
      // could happen on legacy only and when there is no trackDir, in which case, we can't
      // determine whether or not a component file has been deleted, as a result, we are unable
      // to invalidate the cache in such a case.
      return null;
    }
    const filesPaths = this.component.files.map((f) => f.path);
    const componentConfigPath = path.join(workspace.path, rootDir, COMPONENT_CONFIG_FILE_NAME);
    filesPaths.push(componentConfigPath);
    const lastModifiedComponent = await getLastModifiedComponentTimestampMs(rootDir, filesPaths);
    const wasModifiedAfterCache = lastModifiedComponent > cacheData.timestamp;

    if (wasModifiedAfterCache) {
      // in case the env.jsonc was modified, all components using this env should be invalidated as well.
      // we don't have a fast way to check which are those components so we clear them all.
      // in terms of performance, it's not that bad because this file is not modified often.
      const envJsonFile = this.component.files.find((file) => file.relative === 'env.jsonc');
      if (envJsonFile) {
        const lastModifiedEnvJsonc = await getLastModifiedPathsTimestampMs([envJsonFile.path]);
        const wasEnvJsonModifiedAfterCache = lastModifiedEnvJsonc > cacheData.timestamp;
        if (wasEnvJsonModifiedAfterCache) {
          this.logger.debug(`dependencies-loader, the env ${this.idStr} was modified after the cache was created, clearing all deps caches`);
          await workspace.consumer.componentFsCache.deleteAllDependenciesDataCache();
        }
      }
      return null; // cache is invalid.
    }
    this.logger.debug(`dependencies-loader, getting the dependencies data for ${this.idStr} from the cache`);
    return DependenciesData.deserialize(cacheData.data);
  }

  private shouldSaveInCache(dependenciesData: DependenciesData, storeInFsCache = true) {
    if (!storeInFsCache) return false;
    if (!dependenciesData.issues) return true;
    return !dependenciesData.issues.shouldBlockSavingInCache();
  }

  private setDependenciesDataOnComponent(
    dependenciesData: DependenciesData,
    overridesDependencies: OverridesDependencies
  ) {
    this.component.setDependencies(dependenciesData.allDependencies.dependencies);
    this.component.setDevDependencies(dependenciesData.allDependencies.devDependencies);
    this.component.setPeerDependencies(dependenciesData.allDependencies.peerDependencies);
    this.component.packageDependencies = dependenciesData.allPackagesDependencies.packageDependencies ?? {};
    this.component.devPackageDependencies = dependenciesData.allPackagesDependencies.devPackageDependencies ?? {};
    this.component.peerPackageDependencies = dependenciesData.allPackagesDependencies.peerPackageDependencies ?? {};
    const missingFromOverrides = overridesDependencies.missingPackageDependencies;
    if (missingFromOverrides.length) {
      dependenciesData.issues.getOrCreate(IssuesClasses.MissingManuallyConfiguredPackages).data =
        uniq(missingFromOverrides);
    }
    if (!dependenciesData.issues.isEmpty()) this.component.issues = dependenciesData.issues;
    this.component.manuallyRemovedDependencies = overridesDependencies.manuallyRemovedDependencies;
    this.component.manuallyAddedDependencies = overridesDependencies.manuallyAddedDependencies;
    if (dependenciesData.coreAspects.length) {
      this.pushToDependencyResolverExtension('coreAspects', dependenciesData.coreAspects, 'set');
    }
  }

  private pushToDependencyResolverExtension(dataField: string, data: any, operation: 'add' | 'set' = 'add') {
    const depResolverAspectName = DependencyResolverAspect.id;
    let extExistOnComponent = true;
    let ext = this.component.extensions.findCoreExtension(depResolverAspectName);
    if (!ext) {
      extExistOnComponent = false;
      // Create new deps resolver extension entry to add to the component with data only
      ext = new ExtensionDataEntry(undefined, undefined, depResolverAspectName, undefined, {});
    }

    if (!ext.data[dataField]) ext.data[dataField] = [];
    if (operation === 'add') {
      const existing = ext.data[dataField].find((c) => c.packageName === data.packageName);
      if (existing) {
        existing.componentId = data.componentId;
      } else {
        ext.data[dataField].push(data);
      }
    }
    if (operation === 'set') {
      ext.data[dataField] = data;
    }
    if (!extExistOnComponent) {
      this.component.extensions.push(ext);
    }
  }
}
