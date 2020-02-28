import { NetworkExt } from '../network';
import componentProvider from './component.provider';

export default {
  name: 'ComponentFactory',
  dependencies: [NetworkExt],
  config: {},
  provider: componentProvider
};
