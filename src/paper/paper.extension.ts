// eslint-disable-next-line import/prefer-default-export
import { providePaper, PaperConfig, PaperDeps } from './paper.provider';
import { Extension } from '../harmony';
import { BitCliExt } from '../cli';
import { BitExt } from '../bit';

export default Extension.instantiate<PaperConfig, PaperDeps>({
  name: 'Paper',
  dependencies: [BitCliExt, BitExt],
  config: {
    silence: false
  },
  provider: providePaper
});
