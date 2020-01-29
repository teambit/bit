import { Extension } from '../../extensions/harmony';
import { CapsuleExt } from '../capsule';
import componentProvider from './component.provider';

export default Extension.instantiate({
  name: 'ComponentFactory',
  dependencies: [CapsuleExt],
  config: {},
  provider: componentProvider
});
