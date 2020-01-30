// eslint-disable-next-line import/prefer-default-export
import { providePaper, PaperConfig, PaperDeps } from './paper.provider';
import { Extension } from '..//harmony';

export default Extension.instantiate<PaperConfig, PaperDeps>({
  name: 'Paper',
  dependencies: [],
  config: {
    silence: false
  },
  provider: providePaper
});
