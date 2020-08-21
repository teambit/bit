import configProvider from './config.provider';
import { MainRuntime } from '@teambit/cli';
import { ConfigAspect } from './config.aspect';

const ConfigMain = {
  name: 'config',
  runtime: MainRuntime,
  dependencies: [],
  config: {},
  provider: configProvider,
};

export default ConfigMain;

ConfigAspect.addRuntime(ConfigMain);
