/** @flow */

import R from 'ramda';
import { FILE_PROTOCOL_PREFIX, BIT_PROTOCOL_PREFIX } from '../constants';
import { BitId } from '../bit-id';
import ExtensionNameNotValid from './exceptions/extension-name-not-valid';

export default class ExtensionEntry {
  // The extension source (where to load it from)
  source: 'FILE' | 'BIT_CORE' | 'COMPONENT';
  // The value to load (the extension name/id)
  value: string | BitId;

  constructor(extensionName: string) {
    if (R.startsWith(FILE_PROTOCOL_PREFIX, extensionName)) {
      const [, val] = R.split(FILE_PROTOCOL_PREFIX, extensionName);
      this.source = 'FILE';
      this.value = val;
    } else if (R.startsWith(BIT_PROTOCOL_PREFIX, extensionName)) {
      const [, val] = R.split(BIT_PROTOCOL_PREFIX, extensionName);
      this.source = 'BIT_CORE';
      this.value = val;
    } else {
      this.source = 'COMPONENT';
      let bitId: BitId;
      try {
        bitId = BitId.parse(extensionName, true); // todo: make sure it always has a scope
      } catch (err) {
        throw new ExtensionNameNotValid(extensionName);
      }
      if (!bitId || !bitId.scope) throw new ExtensionNameNotValid(extensionName);
      this.value = bitId;
    }
  }
}
