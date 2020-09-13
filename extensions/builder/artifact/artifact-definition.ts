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
   * storage resolver. can be used to replace where artifacts are stored.
   * default resolver persists artifacts on scope. (not recommended for large files!)
   */
  storageResolver?: string;
};
