import fs from 'fs-extra';

import ValidationError from '../../../error/validation-error';
import logger from '../../../logger/logger';
import AbstractVinyl from './abstract-vinyl';

export default class JSONFile extends AbstractVinyl {
  override = false;

  async write(): Promise<string> {
    const stat = await this._getStatIfFileExists();
    if (stat) {
      if (stat.isSymbolicLink()) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        throw new ValidationError(`fatal: trying to write a json file into a symlink file at "${this.path}"`);
      }
      if (!this.override) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        logger.debug(`json-file.write, ignore existing file ${this.path}`);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        return this.path;
      }
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    logger.debug(`json-file.write, path ${this.path}`);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    await fs.outputFile(this.path, this.contents);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.path;
  }

  static load({
    base,
    path,
    content,
    override = false,
  }: {
    base: string;
    path: string;
    content: Record<string, any>;
    override?: boolean;
  }): JSONFile {
    const jsonStr = JSON.stringify(content, null, 4);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const jsonFile = new JSONFile({ base, path, contents: Buffer.from(jsonStr) });
    jsonFile.override = override;
    return jsonFile;
  }
}
