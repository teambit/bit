import { ComponentFactory } from '../component';
import Network from '../network/network';
import { Harmony } from '../../harmony';
import ComponentConfig from '../../consumer/config/component-config';

// import { Registry } from './component-factory';

type ComponentDeps = [Network];
type ComponentConfig = {};

export default async function componentProvider(config: ComponentConfig, [network]: ComponentDeps, harmony: Harmony) {
  // return new ComponentFactory(network, new Registry());
  ComponentConfig.registerOnComponentConfigLoading('component-service', config => {});
  return new ComponentFactory(network);
}
