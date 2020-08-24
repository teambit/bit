import fs from 'fs-extra';

import { LICENSE_FILENAME } from '../../../constants';
import { AbstractVinyl } from '.';

export default class License extends AbstractVinyl {
  override = true;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  src: string;

  write(): Promise<any> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!this.override && fs.existsSync(this.path)) return Promise.resolve();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return fs.outputFile(this.path, this.contents);
  }

  serialize() {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.contents.toString();
  }

  static deserialize(str: string) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new License({ path: LICENSE_FILENAME, contents: str ? Buffer.from(str) : undefined });
  }
}
