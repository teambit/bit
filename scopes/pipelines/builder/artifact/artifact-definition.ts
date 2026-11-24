import type { ArtifactDefinition as ContractArtifactDefinition } from '@teambit/envs.contracts';
import type { ArtifactStorageResolver } from '..';

export type ArtifactDefinition = ContractArtifactDefinition & {
  /**
   * storage resolver. can be used to replace where artifacts are stored.
   * default resolver persists artifacts on scope. (not recommended for large files!)
   */
  storageResolver?: ArtifactStorageResolver;
};

export type ArtifactModelDefinition = Omit<ArtifactDefinition, 'storageResolver'> & {
  storageResolver?: string;
};
