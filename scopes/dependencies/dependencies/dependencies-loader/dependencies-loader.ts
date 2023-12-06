import R from 'ramda';
import path from 'path';
import { uniq } from 'lodash';
import { IssuesClasses } from '@teambit/component-issues';
import { Consumer } from '@teambit/legacy/dist/consumer';
import logger from '@teambit/legacy/dist/logger/logger';
import { getLastModifiedComponentTimestampMs } from '@teambit/legacy/dist/utils/fs/last-modified';
import { ExtensionDataEntry } from '@teambit/legacy/dist/consumer/config';
import Component from '@teambit/legacy/dist/consumer/component/consumer-component';
import { DependencyLoaderOpts } from '@teambit/legacy/dist/consumer/component/component-loader';
import { COMPONENT_CONFIG_FILE_NAME } from '@teambit/legacy/dist/constants';
import { Workspace } from '@teambit/workspace';
import DependencyResolverAspect, { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DevFilesMain } from '@teambit/dev-files';
import { AspectLoaderMain } from '@teambit/aspect-loader';
import { DependenciesData } from './dependencies-data';
import { updateDependenciesVersions } from './dependencies-versions-resolver';
import { AutoDetectDeps, DebugDependencies } from './auto-detect-deps';
import OverridesDependencies from './overrides-dependencies';
import { ApplyOverrides } from './apply-overrides';

export class DependenciesLoader {
  private idStr: string;
  private consumer: Consumer;
  constructor(
    private component: Component,
    private workspace: Workspace,
    private depsResolver: DependencyResolverMain,
    private devFiles: DevFilesMain,
    private aspectLoader: AspectLoaderMain,
    private opts: DependencyLoaderOpts
  ) {
    this.consumer = this.workspace.consumer;
    this.idStr = this.component.id.toString();
  }
  async load() {
    const { dependenciesData, debugDependenciesData } = await this.getDependenciesData();
    const applyOverrides = new ApplyOverrides(this.component, this.depsResolver, this.workspace);
    applyOverrides.allDependencies = dependenciesData.allDependencies;
    applyOverrides.allPackagesDependencies = dependenciesData.allPackagesDependencies;
    if (debugDependenciesData) {
      // if it's coming from the cache, it's empty
      applyOverrides.debugDependenciesData = debugDependenciesData;
    }
    applyOverrides.issues = dependenciesData.issues;
    const results = await applyOverrides.getDependenciesData();
    this.setDependenciesDataOnComponent(results.dependenciesData, results.overridesDependencies);
    updateDependenciesVersions(
      this.depsResolver,
      this.workspace,
      this.component,
      results.overridesDependencies,
      results.autoDetectOverrides,
      applyOverrides.debugDependenciesData.components
    );

    return {
      dependenciesData: results.dependenciesData,
      overridesDependencies: results.overridesDependencies,
      debugDependenciesData: applyOverrides.debugDependenciesData,
    };
  }

  private async getDependenciesData(): Promise<{
    dependenciesData: DependenciesData;
    debugDependenciesData?: DebugDependencies;
  }> {
    const depsDataFromCache = await this.getDependenciesDataFromCacheIfPossible();
    if (depsDataFromCache) {
      return { dependenciesData: depsDataFromCache };
    }

    const autoDetectDeps = new AutoDetectDeps(
      this.component,
      this.workspace,
      this.devFiles,
      this.depsResolver,
      this.aspectLoader
    );
    const results = await autoDetectDeps.getDependenciesData(
      this.opts.cacheResolvedDependencies,
      this.opts.cacheProjectAst
    );
    if (this.shouldSaveInCache(results.dependenciesData)) {
      await this.consumer.componentFsCache.saveDependenciesDataInCache(
        this.idStr,
        results.dependenciesData.serialize()
      );
    }

    return results;
  }

  private async getDependenciesDataFromCacheIfPossible(): Promise<DependenciesData | null> {
    if (!this.opts.useDependenciesCache) {
      return null;
    }
    const cacheData = await this.consumer.componentFsCache.getDependenciesDataFromCache(this.idStr);
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
    const componentConfigPath = path.join(this.consumer.getPath(), rootDir, COMPONENT_CONFIG_FILE_NAME);
    filesPaths.push(componentConfigPath);
    const lastModifiedComponent = await getLastModifiedComponentTimestampMs(rootDir, filesPaths);
    const wasModifiedAfterCache = lastModifiedComponent > cacheData.timestamp;
    if (wasModifiedAfterCache) {
      return null; // cache is invalid.
    }
    logger.debug(`dependencies-loader, getting the dependencies data for ${this.idStr} from the cache`);
    return DependenciesData.deserialize(cacheData.data);
  }

  private shouldSaveInCache(dependenciesData: DependenciesData) {
    if (!dependenciesData.issues) return true;
    return !dependenciesData.issues.shouldBlockSavingInCache();
  }

  private setDependenciesDataOnComponent(
    dependenciesData: DependenciesData,
    overridesDependencies: OverridesDependencies
  ) {
    this.component.setDependencies(dependenciesData.allDependencies.dependencies);
    this.component.setDevDependencies(dependenciesData.allDependencies.devDependencies);
    this.component.packageDependencies = dependenciesData.allPackagesDependencies.packageDependencies ?? {};
    this.component.devPackageDependencies = dependenciesData.allPackagesDependencies.devPackageDependencies ?? {};
    this.component.peerPackageDependencies = dependenciesData.allPackagesDependencies.peerPackageDependencies ?? {};
    const missingFromOverrides = overridesDependencies.missingPackageDependencies;
    if (!R.isEmpty(missingFromOverrides)) {
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
