import { Extension } from '../harmony';
import { PaperExt } from '../paper';
import { BitExt } from '../bit';

export default Extension.instantiate({
  name: 'BitCli',
  dependencies: [PaperExt, BitExt],
  config: {},
  provider: () => {}
});
