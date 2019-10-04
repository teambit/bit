import fs from 'fs-extra';
import { LICENSE_FILENAME } from '../../../constants';
import { AbstractVinyl } from '.';

export default class License extends AbstractVinyl {
  override: boolean | null | undefined = true;
  src: string;

  write(): Promise<any> {
    if (!this.override && fs.existsSync(this.path)) return Promise.resolve();
    return fs.outputFile(this.path, this.contents);
  }

  serialize() {
    return this.contents.toString();
  }

  static deserialize(str: string) {
    return new License({ path: LICENSE_FILENAME, contents: str ? Buffer.from(str) : null });
  }
}
