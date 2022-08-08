import { ArtifactStorageResolver } from '@teambit/builder';
import type { ArtifactFiles } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import type { ArtifactDefinition } from './artifact-definition';
import { Artifact } from './artifact';

export class FsArtifact extends Artifact {
  constructor(
    /**
     * definition of the artifact.
     */
    readonly def: ArtifactDefinition,

    /**
     * storage resolver. can be used to replace where artifacts are stored.
     */
    readonly storageResolvers: ArtifactStorageResolver,

    readonly files: ArtifactFiles,

    /**
     * timestamp of the artifact creation.
     */
    readonly timestamp: number = Date.now(),

    /**
     * join this with `this.paths` to get the absolute paths
     */
    readonly rootDir: string
  ) {
    super(def, storageResolvers, files, rootDir);
  }
}
