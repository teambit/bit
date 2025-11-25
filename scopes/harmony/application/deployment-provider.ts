import type { DeployFn } from './application';

export interface DeploymentProvider {
  deploy: DeployFn;
}
