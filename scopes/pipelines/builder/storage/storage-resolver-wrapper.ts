import { Component } from '@teambit/component';
import { StorageResolver } from './storage-resolver';
import { ArtifactList, FsArtifact } from '../artifact';

/**
 * A wrapper class to manage the user's artifacts storage resolver
 * It responsible to call the store function of the storage resolver and save the result into the artifact list
 */
export default class StorageResolverWrapper {
  constructor(
    private storageResolver: StorageResolver,
    private component: Component,
    private artifactList: ArtifactList<FsArtifact>
  ) {}

  async store() {
    const storeResult = await this.storageResolver.store(this.component, this.artifactList);
    const indexedArtifacts = this.artifactList.indexByArtifactName();
    storeResult.artifacts?.forEach((artifactStoreResult) => {
      const artifact = indexedArtifacts[artifactStoreResult.name];
      artifactStoreResult.files?.forEach((fileStoreResult) => {});
    });
  }
}
