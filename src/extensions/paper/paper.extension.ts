// eslint-disable-next-line import/prefer-default-export
import { providePaper } from './paper.provider';

export default {
  name: 'Paper',
  dependencies: [],
  config: {
    silence: false
  },
  provider: providePaper
};
