import type { ArtifactFiles, ArtifactObject } from '@teambit/component.sources';
import type { TaskDescriptor } from '../build-task';
import type { ArtifactDefinition } from './artifact-definition';
import { DefaultResolver } from '../storage/default-resolver';

export class Artifact {
  constructor(
    /**
     * definition of the artifact.
     */
    readonly def: ArtifactDefinition,

    readonly files: ArtifactFiles,
    /**
     * the declaring task.
     */
    readonly task: TaskDescriptor,
    /**
     * timestamp of the artifact creation.
     */
    readonly timestamp: number = Date.now()
  ) {}

  get storage() {
    return this.storageResolver.name;
  }

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

  /**
   * calculate what could possibly be the root directory of the artifact.
   * in case the deprecated rootDir is set, use it.
   * otherwise, get the common first directory of all files.
   * if there is no common directory, or there are multiple directories return undefined.
   */
  get artifactDir(): string | undefined {
    if (this.def.rootDir) return this.def.rootDir;

    // not sure if needed, it's unclear whether the paths are OS specific or not. (coming from globby).
    const pathsLinux = this.files.paths.map((p) => p.replace(/\\/g, '/'));
    // get the common dir of all paths.
    const firstPath = pathsLinux[0];
    // it's a file in the root, so there is no shared root directory.
    if (!firstPath.includes('/')) return undefined;
    const [potentialSharedDir] = firstPath.split('/');
    const isSharedDir = pathsLinux.every((p) => p.startsWith(`${potentialSharedDir}/`));
    if (!isSharedDir) return undefined;
    return potentialSharedDir;
  }

  isEmpty(): boolean {
    return this.files.isEmpty();
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
}
