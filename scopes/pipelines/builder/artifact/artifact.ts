import type { ArtifactFiles, ArtifactObject } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import type { TaskDescriptor } from '../build-task';
import type { ArtifactDefinition } from './artifact-definition';
import { DefaultResolver } from '../storage/default-resolver';

export class Artifact {
  constructor(
    /**
     * definition of the artifact.
     */
    readonly def: ArtifactDefinition,

    // // /**
    // //  * storage resolver. can be used to replace where artifacts are stored.
    // //  */
    // readonly storageResolver: ArtifactStorageResolver,

    readonly files: ArtifactFiles,

    // /**
    //  * join this with `this.paths` to get the absolute paths
    //  */

    /**
     * the declaring task.
     */
    readonly task: TaskDescriptor // /** //  * timestamp of the artifact creation. //  */ // TODO: Review this // readonly timestamp: number = Date.now()
  ) {}

  get storageResolver() {
    return this.def.storageResolver || new DefaultResolver();
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

  isEmpty(): boolean {
    return this.files.isEmpty();
  }

  // populateVinylFromStorage(file: ArtifactFile): Promise<Vinyl> {
  //   // TODO: implement
  // }

  static fromArtifactObject(object: ArtifactObject): Artifact {
    const artifactDef: ArtifactDefinition = {
      name: object.name,
      generatedBy: object.generatedBy,
      description: object.description,
    };
    const task: TaskDescriptor = {
      aspectId: object.task.id,
      name: object.task.name,
    };
    return new Artifact(artifactDef, object.files, task);
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
