import fs from 'fs-extra';
import stringifyPackage from 'stringify-package';

import ValidationError from '../../error/validation-error';
import logger from '../../logger/logger';
import AbstractVinyl from './sources/abstract-vinyl';

/**
 * When writing the `package.json`, it uses the package `stringifyPackage` from the NPM guys, which
 * takes as arguments the indentation and the type of the newline. The logic used here to write the
 * package.json is exactly the same used by NPM. The indentation and newline are detected when the
 * file is loaded. (@see package-json-file.js)
 */
export default class PackageJsonVinyl extends AbstractVinyl {
  override = true;

  async write(): Promise<string> {
    const stat = await this._getStatIfFileExists();
    if (stat) {
      if (stat.isSymbolicLink()) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        throw new ValidationError(`fatal: trying to write a package.json file into a symlink file at "${this.path}"`);
      }
      if (!this.override) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        logger.debug(`package-json-vinyl.write, ignore existing file ${this.path}`);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        return this.path;
      }
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    logger.debug(`package-json-vinyl.write, path ${this.path}`);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    await fs.outputFile(this.path, this.contents);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.path;
  }

  static load({
    base,
    path,
    content,
    indent,
    newline,
    override = true,
  }: {
    base: string;
    path: string;
    content: Record<string, any>;
    indent?: string | null | undefined;
    newline?: string | null | undefined;
    override?: boolean;
  }): PackageJsonVinyl {
    const jsonStr = stringifyPackage(content, indent, newline);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const jsonFile = new PackageJsonVinyl({ base, path, contents: Buffer.from(jsonStr) });
    jsonFile.override = override;
    return jsonFile;
  }
}
