// import { BitId as ComponentId } from '../bit-id';
// import { Component } from '../component';

import { ExtensionDataList } from 'bit-bin/dist/consumer/config';

/**
 * An interface for components hosts
 * This is used by the core to make sure he can get the components the same way from all hosts
 *
 * @interface ComponentHost
 */
export default interface ComponentHost {
  // get: (id: string) => Promise<Component | undefined>;
  loadExtensions: (extensions: ExtensionDataList) => Promise<void>;
}
