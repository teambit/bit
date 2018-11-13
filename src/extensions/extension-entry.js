/** @flow */

import R from 'ramda';
import { FILE_PROTOCOL_PREFIX, BIT_PROTOCOL_PREFIX } from '../constants';

export default class ExtensionEntry {
  // The extension source (where to load it from)
  source: 'FILE' | 'BIT' | 'COMPONENT';
  // The value to load (the extension name/id)
  val: string;

  constructor(extensionName: string) {
    if (R.startsWith(FILE_PROTOCOL_PREFIX, extensionName)) {
      const [, val] = R.split(FILE_PROTOCOL_PREFIX, extensionName);
      this.source = 'FILE';
      this.val = val;
    } else if (R.startsWith(BIT_PROTOCOL_PREFIX, extensionName)) {
      const [, val] = R.split(BIT_PROTOCOL_PREFIX, extensionName);
      this.source = 'BIT';
      this.val = val;
    } else {
      this.source = 'COMPONENT';
      this.val = extensionName;
    }
  }
}
