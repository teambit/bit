import { StorageResolver } from '../storage';

export type ArtifactProps = {
  /**
   * name of the artifact.
   */
  name: string;

  /**
   * description of the artifact.
   */
  description?: string;

  /**
   * glob patterns of files to include upon artifact creation.
   */
  globPatterns: string[];

  /**
   * storage resolver. can be used to replace where artifacts are stored.
   */
  storageResolver?: StorageResolver;
};

export class Artifact {
  constructor(
    readonly name: string,
    readonly description: string | undefined,
    readonly globPatterns: string[],
    readonly storageResolver: StorageResolver | undefined
  ) {}

  persist() {
    // this.storageResolver.store();
  }

  static create(props: ArtifactProps) {
    return new Artifact(props.name, props.description, props.globPatterns, props.storageResolver);
  }
}
