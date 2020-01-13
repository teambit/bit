import { Extension } from '../harmony';
import { BitExt } from 'bit';

Extension.instantiate({
  name: 'Capsule',
  dependencies: [BitExt],
  config: {},
  provider: async () => {}
});
