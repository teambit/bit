import Network from './network';
import { Capsule } from '../capsule';

export default {
  name: 'Network',
  dependencies: [Capsule],
  config: {},
  provider: Network.provide
};
