import type { ArtifactFiles } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import type { TaskDescriptor } from '../build-task';
import type { ArtifactDefinition } from './artifact-definition';
import type { ArtifactsStorageResolver } from '../storage';
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
    readonly storageResolvers: ArtifactsStorageResolver[],

    readonly files: ArtifactFiles,

    /**
     * the declaring task.
     */
    readonly task: TaskDescriptor,

    /**
     * timestamp of the artifact creation.
     */
    readonly timestamp: number = Date.now(),

    /**
     * join this with `this.paths` to get the absolute paths
     */
    readonly rootDir: string
  ) {
    super(def, storageResolvers, files, task);
  }
}
