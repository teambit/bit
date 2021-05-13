import R from 'ramda';
import path from 'path';
import { IssuesClasses } from '@teambit/component-issues';
import { Consumer } from '../../..';
import logger from '../../../../logger/logger';
import { getLastModifiedComponentTimestampMs } from '../../../../utils/fs/last-modified';
import { ExtensionDataEntry } from '../../../config';
import Component from '../../consumer-component';
import { DependenciesData } from './dependencies-data';
import DependencyResolver from './dependencies-resolver';
import { COMPONENT_CONFIG_FILE_NAME, PACKAGE_JSON } from '../../../../constants';
import { MISSING_PACKAGES_FROM_OVERRIDES_LABEL } from '../../../../cli/templates/component-issues-template';

type Opts = {
  cacheResolvedDependencies: Record<string, any>;
  cacheProjectAst?: Record<string, any>;
  useDependenciesCache: boolean;
};

export class DependenciesLoader {
  private idStr: string;
  constructor(private component: Component, private consumer: Consumer, private opts: Opts) {
    this.idStr = this.component.id.toString();
  }
  async load(): Promise<void> {
    const dependenciesData = await this.getDependenciesData();
    this.setDependenciesDataOnComponent(dependenciesData);
  }

  private async getDependenciesData() {
    const depsDataFromCache = await this.getDependenciesDataFromCacheIfPossible();
    if (depsDataFromCache) {
      return depsDataFromCache;
    }
    const dependencyResolver = new DependencyResolver(this.component, this.consumer);
    const dependenciesData = await dependencyResolver.getDependenciesData(
      this.opts.cacheResolvedDependencies,
      this.opts.cacheProjectAst
    );
    if (this.shouldSaveInCache(dependenciesData)) {
      await this.consumer.componentFsCache.saveDependenciesDataInCache(this.idStr, dependenciesData.serialize());
    }

    return dependenciesData;
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
    const componentConfigFilename = this.consumer.isLegacy ? PACKAGE_JSON : COMPONENT_CONFIG_FILE_NAME;
    const componentConfigPath = path.join(this.consumer.getPath(), rootDir, componentConfigFilename);
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

  private setDependenciesDataOnComponent(dependenciesData: DependenciesData) {
    this.component.setDependencies(dependenciesData.allDependencies.dependencies);
    this.component.setDevDependencies(dependenciesData.allDependencies.devDependencies);
    this.component.packageDependencies = dependenciesData.allPackagesDependencies.packageDependencies;
    this.component.devPackageDependencies = dependenciesData.allPackagesDependencies.devPackageDependencies;
    this.component.peerPackageDependencies = dependenciesData.allPackagesDependencies.peerPackageDependencies;
    const missingFromOverrides = dependenciesData.overridesDependencies.missingPackageDependencies;
    if (!R.isEmpty(missingFromOverrides)) {
      dependenciesData.issues.getOrCreate(IssuesClasses.MissingPackagesDependenciesOnFs).data[
        MISSING_PACKAGES_FROM_OVERRIDES_LABEL
      ] = missingFromOverrides;
    }
    if (!dependenciesData.issues.isEmpty()) this.component.issues = dependenciesData.issues;
    this.component.manuallyRemovedDependencies = dependenciesData.overridesDependencies.manuallyRemovedDependencies;
    this.component.manuallyAddedDependencies = dependenciesData.overridesDependencies.manuallyAddedDependencies;
    if (dependenciesData.coreAspects.length) {
      this.pushToDependencyResolverExtension('coreAspects', dependenciesData.coreAspects, 'set');
    }
  }

  private pushToDependencyResolverExtension(dataField: string, data: any, operation: 'add' | 'set' = 'add') {
    const depResolverAspectName = DependencyResolver.getDepResolverAspectName();
    if (!depResolverAspectName) return;

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
