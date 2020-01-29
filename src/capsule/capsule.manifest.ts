import { Extension } from '../../extensions/harmony';
import CapsuleFactory from './capsule';

export default Extension.instantiate({
  name: 'CapsuleFactory',
  dependencies: [],
  config: {},
  provider: CapsuleFactory.provide
});
