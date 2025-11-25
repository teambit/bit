import type { Component } from '@teambit/component';
import type { ArtifactVinyl } from '@teambit/component.sources';
import type { FsArtifact } from '../artifact';

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
  store(component: Component, artifact: FsArtifact): Promise<StoreResult | undefined | void>;
}

export interface FileStorageResolver extends BaseStorageResolver {
  /**
   * store artifacts in the storage.
   */
  storeFile(component: Component, artifact: FsArtifact, file: ArtifactVinyl): Promise<string | undefined | void>;
}

export type ArtifactStorageResolver = FileStorageResolver | WholeArtifactStorageResolver;
