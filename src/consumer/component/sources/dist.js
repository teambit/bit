/** @flow */
import * as fs from 'fs-extra';
import * as path from 'path';
import Vinyl from 'vinyl';
import { DEFAULT_DIST_DIRNAME } from '../../../constants';
const DEFAULT_SOURCEMAP_VERSION = 3; // TODO - move to constant !

export default class Dist extends Vinyl {
  distFilePath:string;
  constructor(options) {
    super(options);
  }
  static getFilePath(bitPath: string, fileName: string) {
    return path.join(bitPath, DEFAULT_DIST_DIRNAME, fileName);
  }

  write(force?: boolean = true): Promise<string> {
    if (!force && fs.existsSync(this.distFilePath)) return Promise.resolve();
    const distP = new Promise((resolve, reject) =>
      fs.outputFile(this.distFilePath, this.contents, (err) => {
        if (err) return reject(err);
        return resolve(this.distFilePath);
      })
    );

    return Promise.all([distP])
    .then(() => this.distFilePath);
    // TODO - refactor to use the source map as returned value
  }

  buildSourceMap(fileName: string) {
    return JSON.stringify({
      version: DEFAULT_SOURCEMAP_VERSION,
      sources: [path.join('..', fileName)],
      mappings: this.mappings
    });
  }

  toString() {
    return JSON.stringify(this.serialize());
  }

  static fromString(str: string) {
    try {
      return Dist.deserialize(JSON.parse(str));
    } catch (e) {
      return Dist.deserialize({ src: str });
    }
  }

  serialize() {
    return {
      src: this.contents,
      mappings: this.mappings,
    };
  }

  static deserialize({ src, mappings }: { src: string, mappings?: string }) {
    return new Dist(src, mappings);
  }
}
