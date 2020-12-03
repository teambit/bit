import R from 'ramda';
import { Consumer } from '../../..';
import { ExtensionDataEntry } from '../../../config';
import Component from '../../consumer-component';
import { DependenciesData } from './dependencies-data';
import DependencyResolver from './dependencies-resolver';

type Opts = { cacheResolvedDependencies: Record<string, any>; cacheProjectAst?: Record<string, any> };

export class DependenciesLoader {
  constructor(private component: Component, private consumer: Consumer, private opts: Opts) {}
  async load(): Promise<void> {
    const id = this.component.id;
    const compDir = this.component.componentMap?.rootDir || this.consumer.getPath();
    const dependencyResolver = new DependencyResolver(this.component, this.consumer, id);
    const dependenciesData = await dependencyResolver.getDependenciesData(
      compDir,
      this.opts.cacheResolvedDependencies,
      this.opts.cacheProjectAst
    );
    this.setDependenciesDataOnComponent(dependenciesData);
  }

  private setDependenciesDataOnComponent(dependenciesData: DependenciesData) {
    this.component.setDependencies(dependenciesData.allDependencies.dependencies);
    this.component.setDevDependencies(dependenciesData.allDependencies.devDependencies);
    this.component.packageDependencies = dependenciesData.allPackagesDependencies.packageDependencies;
    this.component.devPackageDependencies = dependenciesData.allPackagesDependencies.devPackageDependencies;
    this.component.peerPackageDependencies = dependenciesData.allPackagesDependencies.peerPackageDependencies;
    if (!R.isEmpty(dependenciesData.overridesDependencies.missingPackageDependencies)) {
      dependenciesData.issues.missingPackagesDependenciesFromOverrides =
        dependenciesData.overridesDependencies.missingPackageDependencies;
    }
    if (!R.isEmpty(dependenciesData.issues)) this.component.issues = dependenciesData.issues;
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
