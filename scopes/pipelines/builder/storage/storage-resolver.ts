import { Component } from '@teambit/component';
import { ArtifactList, FsArtifact } from '../artifact';

export type ArtifactFileStoreResult = {
  /**
   * The path of the file - this is used as the file id
   */
  relativePath: string;
  /**
   * Returning a URL will enable the default resolver to try to fetch the artifact even if the original resolver is not loaded
   */
  url?: string;
  metadata?: Object;
};
export type ArtifactStoreResult = {
  /**
   * Name of the artifact - this is used as the artifact id
   */
  name: string;
  files?: ArtifactFileStoreResult[];
};

export type StoreResult = {
  artifacts?: ArtifactStoreResult[];
};

export interface StorageResolver {
  /**
   * name of the storage resolver.
   */
  name: string;

  /**
   * store artifacts in the storage.
   */
  store(component: Component, artifacts: ArtifactList<FsArtifact>): Promise<StoreResult>;
}
