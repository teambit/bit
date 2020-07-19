import fs from 'fs-extra';
import * as pathlib from 'path';

export default function rmDir(path: string) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach((file) => {
      const curPath = pathlib.join(path, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        rmDir(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
}
