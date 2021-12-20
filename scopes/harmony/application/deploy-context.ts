import { BuildContext, ArtifactDefinition } from '@teambit/builder';

export interface DeployContext extends BuildContext {
  artifacts?: ArtifactDefinition[];
}
