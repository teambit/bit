import { MainRuntime } from '@teambit/cli';

import { ConfigAspect } from './config.aspect';
import configProvider from './config.provider';

const ConfigMain = {
  name: 'config',
  runtime: MainRuntime,
  dependencies: [],
  config: {},
  provider: configProvider,
};

export { ConfigMain };

export default ConfigMain;

ConfigAspect.addRuntime(ConfigMain);
