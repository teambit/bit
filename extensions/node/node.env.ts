import { Environment } from '@teambit/environments';

export class NodeEnv implements Environment {
  getDependencies() {
    return {};
  }
}
