import { Artifact } from '../artifact';

export interface StorageResolver {
  /**
   * name of the storage resolver.
   */
  name: string;

  /**
   * store artifacts in the storage.
   */
  store(artifacts: Artifact[]): Promise<void>;
}
