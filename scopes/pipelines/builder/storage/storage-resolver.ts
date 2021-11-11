import { Component } from '@teambit/component';
import { ArtifactList } from '../artifact';

export type ArtifactFileStoreResult = {
  /**
   * Returning a URL will enable the default resolver to try to fetch the artifact even if the original resolver is not loaded
   */
  url?: string;
  metadata?: Object;
};
export type ArtifactStoreResult = {
  files?: ArtifactStoreResult[];
  metadata?: Object;
};

export type StoreResult = {
  artifacts?: ArtifactStoreResult[];
  metadata?: Object;
};

export interface StorageResolver {
  /**
   * name of the storage resolver.
   */
  name: string;

  /**
   * store artifacts in the storage.
   */
  store(component: Component, artifacts: ArtifactList): Promise<StoreResult>;
}
