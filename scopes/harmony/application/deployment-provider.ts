import { DeployContext } from './deploy-context';

export interface DeploymentProvider {
  deploy(context: DeployContext): Promise<void>;
}
