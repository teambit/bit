import fs from 'fs-extra';

import { ValidationError } from '@teambit/legacy.cli.error';
import { logger } from '@teambit/legacy.logger';
import AbstractVinyl from './abstract-vinyl';

export class JSONFile extends AbstractVinyl {
  override = false;

  async write(): Promise<string> {
    const stat = await this._getStatIfFileExists();
    if (stat) {
      if (stat.isSymbolicLink()) {
        throw new ValidationError(`fatal: trying to write a json file into a symlink file at "${this.path}"`);
      }
      if (!this.override) {
        logger.debug(`json-file.write, ignore existing file ${this.path}`);
        return this.path;
      }
    }
    logger.debug(`json-file.write, path ${this.path}`);
    await fs.outputFile(this.path, this.contents);
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
    const jsonFile = new JSONFile({ base, path, contents: Buffer.from(jsonStr) });
    jsonFile.override = override;
    return jsonFile;
  }
}
