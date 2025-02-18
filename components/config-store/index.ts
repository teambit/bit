import { ConfigStoreAspect } from './config-store.aspect';

export type { ConfigStoreMain } from './config-store.main.runtime';
export default ConfigStoreAspect;
export { ConfigStoreAspect };
export { getConfig, getNumberFromConfig, listConfig, Store, setGlobalConfig, delGlobalConfig } from './config-getter';