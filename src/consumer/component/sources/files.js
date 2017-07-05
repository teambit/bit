import fs from 'fs-extra';
import path from 'path';
import Source from './source';
import FileSourceNotFound from '../exceptions/file-source-not-found';
import { isString } from '../../../utils';
import logger from '../../../logger/logger';

export type FileSrc = { name: string, content: string|Buffer };

// TODO: Remove Source?
export default class Files extends Source {
  constructor(src: FileSrc[]) { // eslint-disable-line
    super(src);
  }

  static load(filePaths: Object<string>): Files|null {
    try {
      const files = Object.keys(filePaths).map((file) => {
        return {
          name: file,
          content: fs.readFileSync(filePaths[file])
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

  writeOneFile(filePath, content, force) {
    return new Promise((resolve, reject) => {
      if (!force && fs.existsSync(filePath)) return resolve();
      fs.outputFile(filePath, content, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    });
  }

  write(bitPath: string, force?: boolean = true): Promise<any> {
    return Promise.all(this.src.map((file) => {
      const filePath = path.join(bitPath, file.name);
      return this.writeOneFile(filePath, file.content.contents, force);
    }));
  }

  writeUsingBitMap(projectRoot: string, bitMapFiles: Object<string>, force?: boolean = true) {
    return Promise.all(this.src.map((file) => {
      if (!bitMapFiles[file.name]) {
        logger.error(`could not write the file "${file.name}" as it does not appear in the bit.map file`);
        return Promise.resolve();
      }
      const filePath = path.join(projectRoot, bitMapFiles[file.name]);
      return this.writeOneFile(filePath, file.content.contents, force);
    }));
  }

  serialize(): FileSrc[] {
    return this.src;
  }

  static deserialize(src): Files {
    return new Files(src);
  }
}
