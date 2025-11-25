import type { Component } from '@teambit/component';
import pMapSeries from 'p-map-series';
import type { ArtifactObject, ArtifactVinyl } from '@teambit/component.sources';
import type { ComponentID } from '@teambit/component-id';
import type { Scope } from '@teambit/legacy.scope';
import type { FsArtifact } from './fs-artifact';
import { Artifact } from './artifact';
import type { ArtifactStorageResolver, FileStorageResolver, WholeArtifactStorageResolver } from '../storage';
import { DefaultResolver } from '../storage';

export type ResolverMap<T extends Artifact> = { [key: string]: T[] };

export class ArtifactList<T extends Artifact> extends Array<T> {
  byAspectNameAndName(aspectName?: string, name?: string): ArtifactList<T> {
    const filtered = this.filter((artifact) => {
      let cond = true;
      if (aspectName) {
        cond = cond && artifact.task.aspectId === aspectName;
      }
      if (name) {
        cond = cond && artifact.name === name;
      }
      return cond;
    });
    return ArtifactList.fromArray(filtered);
  }

  byAspectNameAndTaskName(aspectName?: string, name?: string): ArtifactList<T> {
    const filtered = this.filter((artifact) => {
      let cond = true;
      if (aspectName) {
        cond = cond && artifact.task.aspectId === aspectName;
      }
      if (name) {
        cond = cond && artifact.task.name === name;
      }
      return cond;
    });
    return ArtifactList.fromArray(filtered);
  }

  /**
   * find by the artifact name. it's possible to have multiple artifacts with the same name, in which case it returns the first.
   */
  findByName(name: string): Artifact | undefined {
    return this.find((artifact) => artifact.name === name);
  }

  /**
   * find by the task name. it's possible to have multiple tasks with the same name (different aspects), in which case it returns the first.
   */
  findByTaskName(name: string): Artifact | undefined {
    return this.find((artifact) => artifact.task.name === name);
  }

  isEmpty(): boolean {
    return this.every((artifact) => artifact.files.isEmpty());
  }

  /**
   * group artifacts by the storage resolver.
   */
  groupByResolver(): ResolverMap<T> {
    const resolverMap: ResolverMap<T> = {};
    this.forEach((artifact) => {
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
    return this.map((artifact) => artifact.toObject());
  }

  groupByTaskId() {
    return this.reduce((acc: { [key: string]: T }, artifact) => {
      const taskId = artifact.task.aspectId;
      acc[taskId] = artifact;
      return acc;
    }, {});
  }

  async getVinylsAndImportIfMissing(id: ComponentID, scope: Scope): Promise<ArtifactVinyl[]> {
    if (this.isEmpty()) return [];
    const vinyls = await pMapSeries(this, (artifact) => artifact.files.getVinylsAndImportIfMissing(id, scope));
    return vinyls.flat();
  }

  /**
   * store all artifacts using the configured storage resolvers.
   */
  async store(component: Component) {
    const byResolvers = this.groupByResolver();
    await Promise.all(
      Object.keys(byResolvers).map(async (key) => {
        const artifacts = byResolvers[key];
        if (!artifacts.length) return;
        const storageResolver = artifacts[0].storageResolver;
        const artifactList = ArtifactList.fromArray(artifacts);
        await Promise.all(
          artifactList.map(async (artifact) => {
            await this.storeArtifact(storageResolver, artifact, component);
          })
        );
      })
    );
  }

  private async storeArtifact(storageResolver: ArtifactStorageResolver, artifact: Artifact, component: Component) {
    // For now we are always storing also using the default resolver
    if (storageResolver.name !== 'default') {
      const defaultResolver = new DefaultResolver();
      await defaultResolver.store(component, artifact as FsArtifact);
    }
    // @ts-ignore
    if (storageResolver.store && typeof storageResolver.store === 'function') {
      return this.storeWholeArtifactByResolver(storageResolver as WholeArtifactStorageResolver, artifact, component);
    }
    return this.storeArtifactFilesByResolver(storageResolver as FileStorageResolver, artifact, component);
  }

  /**
   * Send the entire artifact to the resolver then get back the result for all files from the resolver
   * @param storageResolver
   * @param artifact
   * @param component
   */
  private async storeWholeArtifactByResolver(
    storageResolver: WholeArtifactStorageResolver,
    artifact: Artifact,
    component: Component
  ) {
    const results = await storageResolver.store(component, artifact as FsArtifact);
    if (!results) return;
    artifact.files.vinyls.map((file) => {
      const url = results[file.relative];
      if (url) {
        file.url = url;
      }
    });
  }

  /**
   * Go over the artifact files and send them to the resolver one by one
   * @param storageResolver
   * @param artifact
   * @param component
   */
  private storeArtifactFilesByResolver(storageResolver: FileStorageResolver, artifact: Artifact, component: Component) {
    const promises = artifact.files.vinyls.map(async (file) => {
      const url = await storageResolver.storeFile(component, artifact as FsArtifact, file);
      if (url) {
        file.url = url;
      }
    });
    return Promise.all(promises);
  }

  static fromArtifactObjects(artifactObjects: ArtifactObject[]): ArtifactList<Artifact> {
    const artifacts = artifactObjects.map((object) => Artifact.fromArtifactObject(object));
    return ArtifactList.fromArray(artifacts);
  }

  static fromArray<T extends Artifact>(artifacts: T[]) {
    return new ArtifactList(...artifacts);
  }
}
