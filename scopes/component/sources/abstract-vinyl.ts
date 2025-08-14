import fs from 'fs-extra';
import * as path from 'path';
import Vinyl from 'vinyl';

import { logger } from '@teambit/legacy.logger';
import { Source } from '@teambit/objects';
import type { PathOsBased } from '@teambit/toolbox.path.path';
import * as eol from '@teambit/toolbox.string.eol';
import type { FileConstructor } from './vinyl-types';

type AbstractVinylProps = {
  cwd: PathOsBased;
  path: PathOsBased;
  base: PathOsBased;
  contents: Buffer;
};

// @ts-ignore
export default class AbstractVinyl extends (Vinyl as FileConstructor) {
  override = true;
  verbose = false;

  static fromVinyl(vinyl: Vinyl): AbstractVinyl {
    if (vinyl instanceof AbstractVinyl) return vinyl;
    return new AbstractVinyl(vinyl);
  }

  get relativeDir() {
    return path.dirname(this.relative);
  }

  // Update the base path and keep the relative value to be the same
  updatePaths({ newBase, newRelative, newCwd }: { newBase?: string; newRelative?: string; newCwd?: string }) {
    const relative = newRelative || this.relative;
    const base = newBase || this.base;
    if (newCwd) this.cwd = newCwd;
    this.base = base;
    this.path = path.join(this.base, relative);
  }

  async write(
    writePath?: string,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    override?: boolean = this.override,
    verbose?: boolean = this.verbose
  ): Promise<string | null | undefined> {
    const filePath = writePath || this.path;
    const msg = _verboseMsg(filePath, override);
    if (verbose) {
      console.log(msg); // eslint-disable-line no-console
    }
    logger.debug(msg);
    if (!override && fs.existsSync(filePath)) return null;
    await fs.outputFile(filePath, eol.auto(this.contents));
    return filePath;
  }

  toReadableString() {
    return {
      relativePath: this.relative,
      content: this.contents.toString(),
    };
  }

  static loadFromParsedStringBase(parsedString: any): AbstractVinylProps {
    const contents = Buffer.isBuffer(parsedString._contents)
      ? parsedString._contents
      : Buffer.from(parsedString._contents);
    return {
      cwd: parsedString._cwd,
      path: parsedString.history[parsedString.history.length - 1],
      base: parsedString._base,
      contents,
    };
  }

  /**
   * before saving component files in the model, their EOL should be converted to Linux format so
   * then when working on the same components in Windows and Linux they won't appear as modified
   */
  toSourceAsLinuxEOL(): Source {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return Source.from(eol.lf(this.contents));
  }

  async _getStatIfFileExists(): Promise<fs.Stats | null | undefined> {
    try {
      return await fs.lstat(this.path);
    } catch {
      return null; // probably file does not exist
    }
  }
}

/**
 * Generate message for the logs and for output in case of verbose
 * this function is exported for testing purposes
 */
export function _verboseMsg(filePath: string, force: boolean) {
  const msg = `writing a file to the file-system at ${filePath}, force: ${force.toString()}`;
  return msg;
}
