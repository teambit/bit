import { Component } from '@teambit/component';
import { ArtifactList } from '../artifact';

export type StoreResult = {
  [path: string]: string;
};

export interface StorageResolver {
  /**
   * name of the storage resolver.
   */
  name: string;

  /**
   * store artifacts in the storage.
   */
  store(component: Component, artifacts: ArtifactList): Promise<void>;
}
