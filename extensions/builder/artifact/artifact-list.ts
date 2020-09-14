import { Artifact } from './artifact';

export type ResolverMap = { [key: string]: Artifact[] };

export class ArtifactList {
  constructor(private artifacts: Artifact[]) {}

  /**
   * return an array of artifact objects.
   */
  toArray() {
    return this.artifacts;
  }

  /**
   * group artifacts by the storage resolver.
   */
  groupByResolver(): ResolverMap {
    const resolverMap: ResolverMap = {};
    this.artifacts.forEach((artifact) => {
      const storageResolver = artifact.storageResolver;
      const resolverArray = resolverMap[storageResolver.name];
      if (!resolverArray) {
        resolverMap[storageResolver.name] = [artifact];
        return;
      }
      if (resolverArray.length) {
        resolverMap[storageResolver.name].push(artifact);
      }
    });

    return resolverMap;
  }

  toObject() {
    return this.artifacts.map((artifact) => artifact.toObject());
  }

  /**
   * store all artifacts using the configured storage resolvers.
   */
  store() {
    const byResolvers = this.groupByResolver();
    const promises = Object.keys(byResolvers).map(async (key) => {
      const artifacts = byResolvers[key];
      if (!artifacts.length) return;
      const storageResolver = artifacts[0].storageResolver;
      await storageResolver.store(artifacts);
    });

    return Promise.all(promises);
  }
}
