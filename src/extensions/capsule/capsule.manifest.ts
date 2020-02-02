import { Extension } from '../../harmony';
import CapsuleFactory from './capsule';

export default Extension.instantiate({
  name: 'CapsuleFactory',
  dependencies: [],
  config: {},
  provider: CapsuleFactory.provide
});
