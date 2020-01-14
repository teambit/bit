import { Extension } from '../harmony';
import { WatchExt } from '../watch';
import { provideServe } from './serve.provider';

export default Extension.instantiate({
  name: 'Serve',
  dependencies: [WatchExt],
  config: {},
  provider: provideServe
});
