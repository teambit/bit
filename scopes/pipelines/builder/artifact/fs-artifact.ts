import type { ArtifactFiles } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import type { ArtifactDefinition } from './artifact-definition';
import { Artifact } from './artifact';
import { TaskDescriptor } from '../build-task';

export class FsArtifact extends Artifact {
  constructor(
    /**
     * definition of the artifact.
     */
    readonly def: ArtifactDefinition,

    readonly files: ArtifactFiles,

    readonly task: TaskDescriptor,
    /**
     * join this with `this.paths` to get the absolute paths
     */
    readonly rootDir: string
  ) {
    super(def, files, task);
  }
}
