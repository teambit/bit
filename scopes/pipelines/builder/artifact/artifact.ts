import Vinyl from 'vinyl';
import { compact, flatten } from 'lodash';
import { ArtifactFiles, ArtifactObject } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import { ArtifactVinyl } from '@teambit/legacy/dist/consumer/component/sources/artifact';
import { ArtifactFile } from '@teambit/legacy/dist/consumer/component/sources/artifact-file';
import { Source } from '@teambit/legacy/dist/scope/models';
import { ScopeMain } from '@teambit/scope';
import type { TaskDescriptor } from '../build-task';
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

    public files: ArtifactFiles,

    /**
     * the declaring task.
     */
    readonly task: TaskDescriptor
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

  isEmpty(): boolean {
    return this.files.isEmpty();
  }

  async populateVinylFromStorage(file: ArtifactFile): Promise<Vinyl> {
    await file.populateVinylFromPath(file.relativePath);
    return file.vinyl;
  }

  static fromArtifactObject(object: ArtifactObject, storageResolvers: ArtifactsStorageResolver[]): Artifact {
    const artifactDef: ArtifactDefinition = {
      name: object.name,
      generatedBy: object.generatedBy,
      description: object.description,
      storageResolver: Array.isArray(object.storage) ? object.storage : [object.storage],
    };
    const task: TaskDescriptor = {
      aspectId: object.task.id,
      name: object.task.name,
    };
    return new Artifact(artifactDef, storageResolvers, object.files, task);
  }

  async getVinylsAndImportIfMissing(scopeName: string, scope: ScopeMain): Promise<ArtifactVinyl[]> {
    const artifactFiles = this.files;
    await artifactFiles.importMissingArtifactObjects(scopeName, scope.legacyScope);
    const vinyls: Vinyl[] = [];
    const vinylsFromScope: Vinyl[] = [];
    const artifactsToLoadFromOtherResolver: ArtifactFile[] = [];

    const promises = artifactFiles.files.map(async (file) => {
      const ref = file.getRef();
      if (ref) {
        const content = (await ref.load(scope.legacyScope.objects)) as Source;
        if (!content) throw new Error(`failed loading file ${file.relativePath} from the model`);
        const vinyl = new ArtifactVinyl({ base: '.', path: file.relativePath, contents: content.contents });
        vinylsFromScope.push(vinyl);
        return Promise.resolve();
      }
      artifactsToLoadFromOtherResolver.push(file);
      return Promise.resolve();
    });

    await Promise.all(promises);

    const vinylsFromOtherStorage = await Promise.all(
      artifactsToLoadFromOtherResolver.map(async (file) => this.populateVinylFromStorage(file))
    );

    return vinyls.concat(compact(vinylsFromScope)).concat(compact(vinylsFromOtherStorage));
    return flatten(vinyls);
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
