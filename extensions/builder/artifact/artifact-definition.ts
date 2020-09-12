export type ArtifactDefinition = {
  /**
   *
   */
  name: string;

  /**
   *
   */
  description?: string;

  /**
   *
   */
  globPatterns: string[];

  storageResolver?: string[];
};
