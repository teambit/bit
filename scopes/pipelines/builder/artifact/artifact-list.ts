import { Component } from '@teambit/component';
import type { ArtifactObject } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import type { Artifact } from './artifact';

export type ResolverMap = { [key: string]: Artifact[] };

export class ArtifactList {
  constructor(readonly artifacts: Artifact[]) {}

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

  toObject(): ArtifactObject[] {
    return this.artifacts.map((artifact) => artifact.toObject());
  }

  groupByTaskId() {
    return this.artifacts.reduce((acc: { [key: string]: Artifact }, artifact) => {
      const taskId = artifact.task.aspectId;
      acc[taskId] = artifact;
      return acc;
    }, {});
  }

  /**
   * store all artifacts using the configured storage resolvers.
   */
  async store(component: Component) {
    const byResolvers = this.groupByResolver();
    const promises = Object.keys(byResolvers).map(async (key) => {
      const artifacts = byResolvers[key];
      if (!artifacts.length) return;
      const storageResolver = artifacts[0].storageResolver;
      const artifactList = new ArtifactList(artifacts);
      await storageResolver.store(component, artifactList);
    });

    return Promise.all(promises);
  }
}
