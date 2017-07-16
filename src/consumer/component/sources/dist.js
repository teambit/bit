/** @flow */
import * as fs from 'fs-extra';
import * as path from 'path';
import Vinyl from 'vinyl';
import { DEFAULT_DIST_DIRNAME } from '../../../constants';

const MAP_EXTENSION = '.map'; // TODO - move to constant !
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
      fs.outputFile(this.distFilePath, this.contents.toString(), (err) => {
        if (err) return reject(err);
        return resolve(this.distFilePath);
      })
    );

    const mappingsFilePath = this.distFilePath + MAP_EXTENSION;
    const sourceMapP = new Promise((resolve, reject) => {
      if (!this.mappings) return resolve();
      return fs.outputFile(mappingsFilePath, this.buildSourceMap(this.basename), (err) => {
        if (err) return reject(err);
        return resolve(mappingsFilePath);
      });
    });

    return Promise.all([distP, sourceMapP])
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
