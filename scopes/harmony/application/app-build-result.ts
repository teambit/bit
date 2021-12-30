import { BuildContext, ArtifactDefinition } from '@teambit/builder';

export interface AppBuildResult extends BuildContext {
  artifacts?: ArtifactDefinition[];
}
