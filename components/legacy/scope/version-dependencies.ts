import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';
import ComponentWithDependencies from './component-dependencies';
import type { ComponentVersion } from './component-version';
import { DependenciesNotFound } from './exceptions/dependencies-not-found';
import type { Repository, Version } from '@teambit/objects';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';

export class VersionDependencies {
  constructor(
    public component: ComponentVersion,
    public dependencies: ComponentVersion[],
    public version: Version
  ) {}

  get allDependencies(): ComponentVersion[] {
    return this.dependencies;
  }

  get allDependenciesIds(): ComponentIdList {
    return ComponentIdList.fromArray(this.dependencies.map((dep) => dep.toComponentId()));
  }

  getMissingDependencies(): ComponentID[] {
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

  async toConsumer(repo: Repository): Promise<ComponentWithDependencies> {
    const depToConsumer = (dep) => dep.toConsumer(repo);
    const dependenciesP = Promise.all(this.dependencies.map(depToConsumer));
    const componentP = this.component.toConsumer(repo);
    const [component, dependencies] = await Promise.all([componentP, dependenciesP]);
    return new ComponentWithDependencies({
      component,
      dependencies,
      devDependencies: [],
      peerDependencies: [],
      extensionDependencies: [],
      missingDependencies: this.getMissingDependencies(),
    });
  }
}

export async function multipleVersionDependenciesToConsumer(
  versionDependencies: VersionDependencies[],
  repo: Repository
): Promise<ConsumerComponent[]> {
  // Only hydrate main components — dependency ConsumerComponents aren't returned, so
  // building them only to discard them wastes (sometimes a lot of) memory.
  const mainCompVers = new Map<string, ComponentVersion>();
  for (const verDep of versionDependencies) {
    const idStr = verDep.component.id.toString();
    if (!mainCompVers.has(idStr)) mainCompVers.set(idStr, verDep.component);
  }

  const flattenedConsumerComp: { [id: string]: ConsumerComponent } = {};
  await pMapPool(
    Array.from(mainCompVers.entries()),
    async ([idStr, compVer]) => {
      flattenedConsumerComp[idStr] = await compVer.toConsumer(repo);
    },
    { concurrency: concurrentComponentsLimit() }
  );
  return versionDependencies.map(
    (verDep) => flattenedConsumerComp[verDep.component.id.toString()] as ConsumerComponent
  );
}
