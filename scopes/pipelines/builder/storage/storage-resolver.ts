import { Component } from '@teambit/component';
import { ArtifactList } from '../artifact';

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
  // metadata?: Object;
};

export type StoreResult = {
  /**
   * The resolver name as registered in the env
   */
  // resolverName: string;
  artifacts?: ArtifactStoreResult[];
  // metadata?: Object;
};

export interface StorageResolver {
  /**
   * name of the storage resolver.
   */
  name: string;

  /**
   * Metadata about the storage resolver
   * This will be stored in version model and will used during fetching artifacts
   */
  // storemetadata: Object;

  /**
   * store artifacts in the storage.
   */
  store(component: Component, artifacts: ArtifactList): Promise<StoreResult>;
}
