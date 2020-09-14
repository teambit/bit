import { Component } from '@teambit/component';
import { Artifact } from '../artifact';

export interface StorageResolver {
  /**
   * name of the storage resolver.
   */
  name: string;

  /**
   * store artifacts in the storage.
   */
  store(component: Component, artifacts: Artifact[]): Promise<void>;
}
