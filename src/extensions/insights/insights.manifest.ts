import { provide } from './insight.provider';
import { ComponentGraphExt } from '../graph';
import { BitCli } from '../cli';

export default {
  name: 'insights',
  dependencies: [ComponentGraphExt, BitCli],
  config: {
    silence: false
  },
  provider: provide
};
