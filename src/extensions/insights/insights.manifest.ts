import { provide } from './insight.provider';
import { ComponentGraphExt } from '../graph';
import { BitCliExt } from '../cli';

export default {
  name: 'insights',
  dependencies: [ComponentGraphExt, BitCliExt],
  config: {
    silence: false
  },
  provider: provide
};
