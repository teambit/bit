import { Component } from '@teambit/component';
import { ArtifactVinyl } from '@teambit/legacy/dist/consumer/component/sources/artifact';
import { Artifact, FsArtifact } from '../artifact';

export type StoreResult = {
  [path: string]: string;
};

interface BaseStorageResolver {
  /**
   * name of the storage resolver.
   */
  name: string;
}

export interface WholeArtifactStorageResolver extends BaseStorageResolver {
  /**
   * store artifacts in the storage.
   */
  store(component: Component, artifact: Artifact): Promise<StoreResult | undefined | void>;
}

export interface FileStorageResolver extends BaseStorageResolver {
  /**
   * store artifacts in the storage.
   */
  storeFile(component: Component, artifact: Artifact, file: ArtifactVinyl): Promise<string | undefined | void>;
}

export type ArtifactStorageResolver = FileStorageResolver | WholeArtifactStorageResolver;
