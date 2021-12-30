import { DeployFn } from './application';

export interface DeploymentProvider {
  deploy: DeployFn;
}
