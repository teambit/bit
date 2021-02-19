import type { ArtifactFiles, ArtifactObject } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import type { BuildTask } from '../build-task';
import type { StorageResolver } from '../storage';
import type { ArtifactDefinition } from './artifact-definition';

export class Artifact {
  constructor(
    /**
     * definition of the artifact.
     */
    readonly def: ArtifactDefinition,

    /**
     * storage resolver. can be used to replace where artifacts are stored.
     */
    readonly storageResolver: StorageResolver,

    readonly files: ArtifactFiles,

    /**
     * join this with `this.paths` to get the absolute paths
     */
    readonly rootDir: string,

    /**
     * the declaring task.
     * todo: change this to taskDescriptor that has only the metadata of the task, so it could be
     * saved into the model.
     */
    readonly task: BuildTask,

    /**
     * timestamp of the artifact creation.
     */
    readonly timestamp: number = Date.now()
  ) {}

  get storage() {
    return this.storageResolver;
  }

  /**
   * name of the artifact.
   */
  get name(): string {
    return this.def.name;
  }

  /**
   * description of the artifact.
   */
  get description() {
    return this.def.description;
  }

  /**
   * aspect id (string) that generated the artifact
   */
  get generatedBy(): string {
    return this.def.generatedBy || this.task.aspectId;
  }

  /**
   * archive all artifact files into a tar.
   */
  tar() {}

  toObject(): ArtifactObject {
    return {
      name: this.name,
      description: this.description,
      generatedBy: this.generatedBy,
      storage: this.storageResolver.name,
      task: {
        id: this.task.aspectId,
        name: this.task.name,
      },
      files: this.files,
    };
  }
}
