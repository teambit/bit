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

    /**
     * relative paths of the artifacts
     */
    readonly paths: string[] = [],

    /**
     * join this with `this.paths` to get the absolute paths
     */
    readonly rootDir: string,

    /**
     * the declaring task.
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
   * archive all artifact files into a tar.
   */
  tar() {}

  toObject() {
    // TODO: we have complicated relationship between components. we need a better way to handle models and store.
    return {
      name: this.name,
      description: this.description,
      def: this.def,
      storage: this.storageResolver.name,
      task: {
        id: this.task.id,
        name: this.task.name,
      },
    };
  }
}
