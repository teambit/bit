import mapSeries from 'p-map-series';
import R from 'ramda';
import { BitId, BitIds } from '../bit-id';
import { ManipulateDirItem } from '../consumer/component-ops/manipulate-dir';
import ComponentWithDependencies from './component-dependencies';
import ComponentVersion, { ObjectCollector, CollectObjectsOpts } from './component-version';
import { DependenciesNotFound } from './exceptions/dependencies-not-found';
import { Version } from './models';
import { ObjectItem } from './objects/object-list';
import Repository from './objects/repository';
import ConsumerComponent from '../consumer/component';

export default class VersionDependencies implements ObjectCollector {
  constructor(
    public component: ComponentVersion,
    public dependencies: ComponentVersion[],
    public sourceScope: string,
    public version: Version
  ) {}

  get allDependencies(): ComponentVersion[] {
    return this.dependencies;
  }

  get allDependenciesIds(): BitIds {
    return BitIds.fromArray(this.dependencies.map((dep) => dep.id));
  }

  getMissingDependencies(): BitId[] {
    const allDepsIds = this.allDependenciesIds;
    return this.version.flattenedDependencies.filter((id) => !allDepsIds.has(id));
  }

  throwForMissingDependencies() {
    const missing = this.getMissingDependencies();
    if (missing.length) {
      throw new DependenciesNotFound(
        this.component.id.toString(),
        missing.map((m) => m.toString())
      );
    }
  }

  async toConsumer(
    repo: Repository,
    manipulateDirData: ManipulateDirItem[] | null | undefined
  ): Promise<ComponentWithDependencies> {
    const depToConsumer = (dep) => dep.toConsumer(repo, manipulateDirData);
    const dependenciesP = Promise.all(this.dependencies.map(depToConsumer));
    const componentP = this.component.toConsumer(repo, manipulateDirData);
    const [component, dependencies] = await Promise.all([componentP, dependenciesP]);
    return new ComponentWithDependencies({
      component,
      dependencies,
      devDependencies: [],
      extensionDependencies: [],
      missingDependencies: this.getMissingDependencies(),
    });
  }

  async collectObjects(
    repo: Repository,
    clientVersion: string | null | undefined,
    options: CollectObjectsOpts
  ): Promise<ObjectItem[]> {
    // for the dependencies, don't collect parents they might not exist
    const depOptions: CollectObjectsOpts = { ...options, collectParents: false };
    const depsP = mapSeries(this.allDependencies, (dep) => dep.collectObjects(repo, clientVersion, depOptions));
    const compP = this.component.collectObjects(repo, clientVersion, options);
    const [component, dependencies] = await Promise.all([compP, depsP]);
    return [...component, ...R.flatten(dependencies)];
  }
}

export async function multipleVersionDependenciesToConsumer(
  versionDependencies: VersionDependencies[],
  repo: Repository
): Promise<ComponentWithDependencies[]> {
  const flattenedCompVer: { [id: string]: ComponentVersion } = {};
  const flattenedConsumerComp: { [id: string]: ConsumerComponent } = {};

  versionDependencies.forEach((verDep) => {
    const allComps = [verDep.component, ...verDep.dependencies];
    allComps.forEach((compVer) => {
      flattenedCompVer[compVer.id.toString()] = compVer;
    });
  });

  await Promise.all(
    Object.keys(flattenedCompVer).map(async (idStr) => {
      flattenedConsumerComp[idStr] = await flattenedCompVer[idStr].toConsumer(repo, null);
    })
  );
  return versionDependencies.map((verDep) => {
    return new ComponentWithDependencies({
      component: flattenedConsumerComp[verDep.component.id.toString()] as ConsumerComponent,
      dependencies: verDep.dependencies.map((d) => flattenedConsumerComp[d.id.toString()]),
      devDependencies: [],
      extensionDependencies: [],
      missingDependencies: verDep.getMissingDependencies(),
    });
  });
}
