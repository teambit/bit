import { BuildContext } from '@teambit/builder';
import { Capsule } from '@teambit/isolator';

export interface DeploymentProvider {
  deploy(context: BuildContext, capsule: Capsule): Promise<void>;
}
