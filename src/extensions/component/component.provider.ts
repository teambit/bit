import { ComponentFactory } from '../component';
import Network from '../network/network';
// import { Registry } from './component-factory';

type ComponentDeps = [Network];
type ComponentConfig = {};

export default async function componentProvider(config: ComponentConfig, [network]: ComponentDeps) {
  // return new ComponentFactory(network, new Registry());
  return new ComponentFactory(network);
}
