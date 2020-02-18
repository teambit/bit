import Watch from './watch';
import WatchComponents from '../../consumer/component-ops/watch-components';

export default {
  name: 'Watch',
  config: {},
  dependencies: [],
  provider: async () => {
    return new Watch(new WatchComponents(true));
  }
};
