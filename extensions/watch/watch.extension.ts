import Watch from './watch';
import WatchComponents from 'bit-bin/dist/consumer/component-ops/watch-components';

export default {
  name: 'Watch',
  dependencies: [],
  provider: async () => {
    return new Watch(new WatchComponents(true));
  }
};
