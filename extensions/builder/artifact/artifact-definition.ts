export type ArtifactDefinition = {
  /**
   * name of the artifact.
   */
  name: string;

  /**
   * description of the artifact.
   */
  description?: string;

  /**
   * glob patterns of files to include upon artifact creation. minimatch is used to match the patterns.
   * e.g. ['*.ts', '!foo.ts'] matches all ts files but ignores foo.ts.
   */
  globPatterns: string[];

  /**
   * define the root directory for reading the artifacts from the capsule file system.
   */
  rootDir?: string;

  /**
   * adds a directory prefix for all artifact files.
   */
  dirPrefix?: string;

  /**
   * determine the context of the artifact.
   * default artifact context is `component`.
   */
  context?: 'component' | 'env';

  /**
   * storage resolver. can be used to replace where artifacts are stored.
   * default resolver persists artifacts on scope. (not recommended for large files!)
   */
  storageResolver?: string;
};
