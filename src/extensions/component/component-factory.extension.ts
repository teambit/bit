import { CapsuleExt } from '../capsule';
import componentProvider from './component.provider';

export default {
  name: 'ComponentFactory',
  dependencies: [CapsuleExt],
  config: {},
  provider: componentProvider
};
