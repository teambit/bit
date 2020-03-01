import { ComponentFactory } from '../component';
import Network from '../network/network';

type ComponentDeps = [Network];
type ComponentConfig = {};

export default async function componentProvider(config: ComponentConfig, [network]: ComponentDeps) {
  return new ComponentFactory(network);
}
