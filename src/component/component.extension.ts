import { Extension } from '../harmony';
import { CapsuleExt } from '../capsule';
import componentProvider from './component.provider';

export default Extension.instantiate({
  name: 'Component',
  dependencies: [CapsuleExt],
  config: {},
  provider: componentProvider
});
