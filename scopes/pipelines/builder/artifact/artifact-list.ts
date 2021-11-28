import { Component } from '@teambit/component';
import type { ArtifactObject } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import { ScopeMain } from '@teambit/scope';
import { ArtifactVinyl } from '@teambit/legacy/dist/consumer/component/sources/artifact';
import { flatten } from 'lodash';
import { ArtifactsStorageResolver } from '..';
import { Artifact } from './artifact';
import { StorageResolverNotFoundError } from './exceptions';
import { DefaultResolver } from '../storage';
import { FsArtifact } from '.';
import { StoreResult } from '../storage/storage-resolver';
// import { FsArtifact } from './fs-artifact';

export type ResolverMap<T extends Artifact> = { [key: string]: T[] };

export class ArtifactList<T extends Artifact> {
  defaultResolver = new DefaultResolver();
  constructor(readonly artifacts: T[]) {}

  static fromArtifactObjects(
    artifactObjects: ArtifactObject[],
    storageResolvers: ArtifactsStorageResolver[]
  ): ArtifactList<Artifact> {
    const artifacts = artifactObjects.map((object) => Artifact.fromArtifactObject(object, storageResolvers));
    return new ArtifactList(artifacts);
  }

  /**
   * return an array of artifact objects.
   */
  toArray() {
    return this.artifacts;
  }

  map(fn: (file: T) => any) {
    return this.artifacts.map((artifact) => fn(artifact));
  }

  forEach(fn: (file: T) => void) {
    return this.artifacts.forEach((artifact) => fn(artifact));
  }

  filter(fn: (file: T) => boolean): ArtifactList<T> {
    const filtered = this.artifacts.filter((artifact) => fn(artifact));
    return new ArtifactList(filtered);
  }

  isEmpty(): boolean {
    return !this.artifacts.length;
  }

  /**
   * Get the artifacts indexed by their names
   * @returns
   */
  indexByArtifactName(): { [artifactName: string]: Artifact } {
    const map = {};
    this.artifacts.forEach((artifact) => {
      map[artifact.name] = artifact;
    });
    return map;
  }

  /**
   * group artifacts by the storage resolver.
   */
  groupByResolver(): ResolverMap<T> {
    const resolverMap: ResolverMap<T> = {};
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

  byAspectNameAndName(aspectName?: string, name?: string): ArtifactList<T> {
    const filtered = this.artifacts.filter((artifact) => {
      let cond = true;
      if (aspectName) {
        cond = cond && artifact.task.aspectId === aspectName;
      }
      if (name) {
        cond = cond && artifact.name === name;
      }
      return cond;
    });
    return new ArtifactList(filtered);
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

  async getVinylsAndImportIfMissing(scopeName: string, scope: ScopeMain): Promise<ArtifactVinyl[]> {
    const vinyls = await Promise.all(
      this.artifacts.map((artifact) => artifact.getVinylsAndImportIfMissing(scopeName, scope))
    );
    return flatten(vinyls);
  }

  /**
   * store all artifacts using the configured storage resolvers.
   */
  async store(
    component: Component,
    storageResolvers: { [resolverName: string]: ArtifactsStorageResolver }
  ): Promise<StoreResult[]> {
    const byResolvers = this.groupByResolver();
    const promises = Object.keys(byResolvers).map(async (resolverName) => {
      const artifacts = byResolvers[resolverName];
      // if (!artifacts.length) return undefined;
      const storageResolver =
        resolverName === this.defaultResolver.name ? this.defaultResolver : storageResolvers[resolverName];
      if (!storageResolver) {
        throw new StorageResolverNotFoundError(resolverName, component);
      }
      const artifactList = new ArtifactList<T>(artifacts);
      return storageResolver.store(component, artifactList as any as ArtifactList<FsArtifact>);
    });

    const results = await Promise.all(promises);
    return results;
  }
}
