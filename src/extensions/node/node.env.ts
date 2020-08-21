import { Environment } from '../environments';

export class NodeEnv implements Environment {
  getDependencies() {
    return {};
  }
}
