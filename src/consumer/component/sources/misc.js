import fs from 'fs';
import path from 'path';
import Source from './source';

export default class Misc extends Source {
  constructor(src: []) {
    super(src);
  }

  static load(miscs: []): Misc|null {
    try {
      const miscFiles = miscs.map(file => {
        return { name: path.basename(file), content: fs.readFileSync(file) }
      } );
      return new Misc(miscFiles);
    } catch (err) {
      if (err.code === 'ENOENT' && err.path) {
        console.log(`\nwarning: the file ${err.path} mentioned in your bit.json inside source.misc was not found!\n`);
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
    return Promise.all(this.src.map(file => {
      const filePath = path.join(bitPath, file.name);
      if (!force && fs.existsSync(filePath)) return Promise.resolve();
      return this.writeOneFile(filePath, file.content.contents);
    }));
  }
}
