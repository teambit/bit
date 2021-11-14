import type { ArtifactFiles, ArtifactObject } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import type { BuildTask } from '../build-task';
import type { ArtifactDefinition } from './artifact-definition';
import type { ArtifactsStorageResolver } from '../storage';

export class Artifact {
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
    return this.storageResolvers;
  }

  get storageResolversNames() {
    return this.storageResolvers.map((resolver) => resolver.name);
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
      // storage: this.storage,
      storage: this.storageResolversNames,
      task: {
        id: this.task.aspectId,
        name: this.task.name,
      },
      files: this.files,
    };
  }
}
