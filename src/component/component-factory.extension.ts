import { Extension } from '../harmony';
import CapsuleExt from '../environment/capsule.extension';
import componentProvider from './component.provider';

export default Extension.instantiate({
  name: 'ComponentFactory',
  dependencies: [CapsuleExt],
  config: {},
  provider: componentProvider
});
