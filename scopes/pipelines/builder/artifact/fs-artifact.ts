import type { ArtifactFiles } from '@teambit/component.sources';
import type { ArtifactDefinition } from './artifact-definition';
import { Artifact } from './artifact';
import type { TaskDescriptor } from '../build-task';

export class FsArtifact extends Artifact {
  constructor(
    /**
     * definition of the artifact.
     */
    readonly def: ArtifactDefinition,

    readonly files: ArtifactFiles,

    readonly task: TaskDescriptor,

    readonly rootDir: string
  ) {
    super(def, files, task);
  }
}
