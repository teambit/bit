import { BuildContext, ArtifactList } from '@teambit/builder';

export interface DeployContext extends BuildContext {
  artifactList?: ArtifactList;
}
