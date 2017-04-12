/** @flow */
import * as fs from 'fs-extra';
import * as path from 'path';
import Source from './source';
import { DEFAULT_BUNDLE_FILENAME, DEFAULT_DIST_DIRNAME } from '../../constants';

const MAP_EXTENSION = '.map'; // TODO - move to constant !
const DEFAULT_SOURCEMAP_VERSION = 3; // TODO - move to constant !

export default class Dist extends Source {
  mappings: ?string;

  constructor(src: string, mappings: ?string) {
    super(src);
    this.mappings = mappings;
  }

  write(bitPath: string, implFileName: string, force?: boolean = true): Promise<any> {
    const distFilePath = path.join(bitPath, DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME);
    if (!force && fs.existsSync(distFilePath)) return Promise.resolve();
    const distP = new Promise((resolve, reject) =>
      fs.outputFile(distFilePath, this.buildSrcWithSourceMapAnnotation(), (err) => {
        if (err) return reject(err);
        return resolve(distFilePath);
      }),
    );

    const mappingsFilePath = distFilePath + MAP_EXTENSION;
    const sourceMapP = new Promise((resolve, reject) => {
      if (!this.mappings) return resolve();
      return fs.outputFile(mappingsFilePath, this.buildSourceMap(implFileName), (err) => {
        if (err) return reject(err);
        return resolve(mappingsFilePath);
      });
    });

    return Promise.all([distP, sourceMapP])
    .then(([distPath, SourceMapPath]) => distFilePath); // eslint-disable-line
    // TODO - refactor to use the source map as returned value
  }

  buildSourceMap(implFileName: string) {
    return JSON.stringify({
      version: DEFAULT_SOURCEMAP_VERSION,
      sources: [path.join('..', implFileName)],
      mappings: this.mappings,
    });
  }

  buildSrcWithSourceMapAnnotation() {
    return this.mappings ?
    `${this.src}\n\n//# sourceMappingURL=${DEFAULT_BUNDLE_FILENAME}${MAP_EXTENSION}` : this.src;
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
      src: this.src,
      mappings: this.mappings,
    };
  }

  static deserialize({ src, mappings }: { src: string, mappings?: string }) {
    return new Dist(src, mappings);
  }
}
