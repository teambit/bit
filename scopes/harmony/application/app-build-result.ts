import { ArtifactDefinition } from '@teambit/builder';

export interface AppBuildResult {
  artifacts?: ArtifactDefinition[];

  /**
   * errors thrown during the build process.
   */
  errors?: Error[];

  /**
   * warnings thrown during the build process.
   */
  warnings?: string[];
}
