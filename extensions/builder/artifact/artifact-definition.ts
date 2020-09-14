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
   * glob patterns of files to include upon artifact creation.
   */
  globPatterns: string[];

  /**
   * determine the context of the artifact.
   */
  context?: 'component' | 'env';

  /**
   * storage resolver. can be used to replace where artifacts are stored.
   * default resolver persists artifacts on scope. (not recommended for large files!)
   */
  storageResolver?: string;
};
