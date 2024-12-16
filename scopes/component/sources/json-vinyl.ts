import { dirname, basename } from 'path';
import fs from 'fs-extra';
import stringifyPackage from 'stringify-package';
import writeFileAtomic from 'write-file-atomic';
import { ValidationError } from '@teambit/legacy.cli.error';
import { logger } from '@teambit/legacy.logger';
import AbstractVinyl from './abstract-vinyl';

/**
 * When writing the `package.json`, it uses the package `stringifyPackage` from the NPM guys, which
 * takes as arguments the indentation and the type of the newline. The logic used here to write the
 * package.json is exactly the same used by NPM. The indentation and newline are detected when the
 * file is loaded. (@see package-json-file.js)
 */
export class JsonVinyl extends AbstractVinyl {
  override = true;

  async write(): Promise<string> {
    const stat = await this._getStatIfFileExists();
    if (stat) {
      if (stat.isSymbolicLink()) {
        throw new ValidationError(
          `fatal: trying to write a ${basename(this.path)} file into a symlink file at "${this.path}"`
        );
      }
      if (!this.override) {
        logger.debug(`json-vinyl.write, ignore existing file ${this.path}`);
        return this.path;
      }
    }
    logger.debug(`json-vinyl.write, path ${this.path}`);
    await fs.mkdirp(dirname(this.path));
    await writeFileAtomic(this.path, this.contents);
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
  }): JsonVinyl {
    const jsonStr = stringifyPackage(content, indent, newline);
    const jsonFile = new JsonVinyl({ base, path, contents: Buffer.from(jsonStr) });
    jsonFile.override = override;
    return jsonFile;
  }
}
