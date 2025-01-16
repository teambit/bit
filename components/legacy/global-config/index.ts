import GlobalConfig from './config';

export { GlobalConfig };
export { getGlobalConfigPath } from './config';
export {
  invalidateCache,
  getNumberFromConfig,
  getSync,
  setSync,
  delSync,
  del,
  set,
  get,
  list,
  listSync,
  ENV_VARIABLE_CONFIG_PREFIX,
} from './global-config';
