import fs from 'fs-extra';

import { LICENSE_FILENAME } from '@teambit/legacy.constants';
import AbstractVinyl from './abstract-vinyl';

export default class License extends AbstractVinyl {
  override = true;
  src: string;

  write(): Promise<any> {
    if (!this.override && fs.existsSync(this.path)) return Promise.resolve();
    return fs.outputFile(this.path, this.contents);
  }

  serialize() {
    return this.contents.toString();
  }

  static deserialize(str: string) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new License({ path: LICENSE_FILENAME, contents: str ? Buffer.from(str) : undefined });
  }
}
