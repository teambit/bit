import type { ArtifactDefinition } from '@teambit/builder';

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

  /**
   * metadata to persist.
   * this is the only property that actually gets saved into the objects (in builder aspect, aspectsData.buildDeployContexts[deployContext]).
   * in some scenarios, the build and deploy pipelines run in different processes, and then the only data the deploy
   * gets is what saved into the objects.
   * examples of data that gets save here:
   * React: { publicDir, ssrPublicDir }.
   * Node: { mainFile, artifactsDir }.
   */
  metadata?: Record<string, any>;
}
