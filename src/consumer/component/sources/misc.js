import fs from 'fs';
import path from 'path';
import Source from './source';
import MiscSourceNotFound from '../exceptions/misc-source-not-found';

export type MiscSrc = { name: string, content: string|Buffer };

export default class Misc extends Source {
  constructor(src: MiscSrc[]) { // eslint-disable-line
    super(src);
  }

  static load(filePaths: []): Misc|null {
    try {
      const miscFiles = filePaths.map((file) => {
        return {
          name: path.basename(file),
          content: fs.readFileSync(file)
        };
      });
      return new Misc(miscFiles);
    } catch (err) {
      if (err.code === 'ENOENT' && err.path) {
        throw new MiscSourceNotFound(err.path);
      }
      return null;
    }
  }

  writeOneFile(filePath, content) {
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, content, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    });
  }

  write(bitPath: string, force?: boolean = true): Promise<any> {
    return Promise.all(this.src.map((file) => {
      const filePath = path.join(bitPath, file.name);
      if (!force && fs.existsSync(filePath)) return Promise.resolve();
      return this.writeOneFile(filePath, file.content.contents);
    }));
  }

  serialize(): MiscSrc[] {
    return this.src;
  }

  deserialize(src): Misc {
    return new Misc(src);
  }
}
