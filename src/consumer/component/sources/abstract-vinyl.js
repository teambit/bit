/** @flow */
import path from 'path';
import fs from 'fs-extra';
import Vinyl from 'vinyl';
import logger from '../../../logger/logger';
import { eol } from '../../../utils';
import type { PathOsBased } from '../../../utils/path';
import Source from '../../../scope/models/source';

type AbstractVinylProps = {
  cwd: PathOsBased,
  path: PathOsBased,
  base: PathOsBased,
  contents: Buffer
};
export default class AbstractVinyl extends Vinyl {
  base: PathOsBased;
  path: PathOsBased;
  relative: PathOsBased;
  override: boolean = true;
  verbose: boolean = false;

  // Update the base path and keep the relative value to be the same
  updatePaths({ newBase, newRelative, newCwd }: { newBase: string, newRelative?: string, newCwd?: string }) {
    const relative = newRelative || this.relative;
    if (newCwd) this.cwd = newCwd;
    this.base = newBase;
    this.path = path.join(this.base, relative);
  }

  async write(
    writePath?: string,
    override?: boolean = this.override,
    verbose?: boolean = this.verbose
  ): Promise<?string> {
    const filePath = writePath || this.path;
    const msg = _verboseMsg(filePath, override);
    if (verbose) {
      console.log(msg); // eslint-disable-line no-console
    }
    logger.debug(msg);
    if (!override && fs.existsSync(filePath)) return null;
    await fs.outputFile(filePath, eol.auto(this.contents, this.relative));
    return filePath;
  }

  toReadableString() {
    return {
      relativePath: this.relative,
      content: this.contents.toString()
    };
  }

  static loadFromParsedString(parsedString: Object): AbstractVinylProps {
    const contents = Buffer.isBuffer(parsedString._contents)
      ? parsedString._contents
      : Buffer.from(parsedString._contents);
    return {
      cwd: parsedString._cwd,
      path: parsedString.history[parsedString.history.length - 1],
      base: parsedString._base,
      contents
    };
  }

  static loadFromParsedStringArray(arr: Object[]): ?(AbstractVinylProps[]) {
    if (!arr) return undefined;
    return arr.map(this.loadFromParsedString);
  }

  /**
   * before saving component files in the model, their EOL should be converted to Linux format so
   * then when working on the same components in Windows and Linux they won't appear as modified
   */
  toSourceAsLinuxEOL(): Source {
    // $FlowFixMe
    return Source.from(eol.lf(this.contents, this.relative));
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
