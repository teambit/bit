import fs from 'fs';
import path from 'path';
import Source from './source';
import FileSourceNotFound from '../exceptions/file-source-not-found';

export type FileSrc = { name: string, content: string|Buffer };

export default class Files extends Source {
  constructor(src: FileSrc[]) { // eslint-disable-line
    super(src);
  }

  static load(filePaths: []): Files|null {
    try {
      const files = filePaths.map((file) => {
        return {
          name: path.basename(file),
          content: fs.readFileSync(file)
        };
      });
      return new Files(files);
    } catch (err) {
      if (err.code === 'ENOENT' && err.path) {
        throw new FileSourceNotFound(err.path);
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

  serialize(): FileSrc[] {
    return this.src;
  }

  static deserialize(src): Files {
    return new Files(src);
  }
}
