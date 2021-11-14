import { Component } from '@teambit/component';
import type { ArtifactObject } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import { ArtifactsStorageResolver } from '..';
import type { Artifact } from './artifact';
import { StorageResolverNotFoundError } from './exceptions';
import { DefaultResolver } from '../storage';

export type ResolverMap = { [key: string]: Artifact[] };

export class ArtifactList {
  defaultResolver = new DefaultResolver();
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
      const storageResolvers = artifact.storage;
      storageResolvers.forEach((resolver) => {
        const resolverName = resolver.name;
        const resolverArray = resolverMap[resolverName];
        if (!resolverArray) {
          resolverMap[resolverName] = [artifact];
          return;
        }
        if (resolverArray.length) {
          resolverMap[resolverName].push(artifact);
        }
      });
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
  async store(component: Component, storageResolvers: { [resolverName: string]: ArtifactsStorageResolver }) {
    console.log('storing compoennt', component.id.toString());
    const byResolvers = this.groupByResolver();
    const promises = Object.keys(byResolvers).map(async (resolverName) => {
      const artifacts = byResolvers[resolverName];
      // if (!artifacts.length) return undefined;
      const storageResolver =
        resolverName === this.defaultResolver.name ? this.defaultResolver : storageResolvers[resolverName];
      if (resolverName !== 'default') {
        console.log('resolverName', resolverName);
        console.log('storageResolver', storageResolver);
      }
      if (!storageResolver) {
        throw new StorageResolverNotFoundError(resolverName, component);
      }
      const artifactList = new ArtifactList(artifacts);
      return storageResolver.store(component, artifactList);
    });

    const results = await Promise.all(promises);
    return results;
  }
}
