import path from 'path';
import fs from 'fs-extra';
import childProcessP from 'child-process-promise';
import { FileAlreadyExists } from '../exceptions'
const exec = childProcessP.exec

export default async function pack(cwd: string, outputPath: string, override: boolean = false): string {
  const pjson = require(path.join(cwd,'package.json'));
  const tgzName = `${pjson.name}-${pjson.version}.tgz`;
  const tgzOriginPath = path.join(cwd, tgzName)
  const tgzDestinationPath = path.join(outputPath, tgzName);

  await exec('npm pack', { cwd })
  if (fs.pathExistsSync(tgzDestinationPath)) {
    if (override) {
      fs.removeSync(tgzDestinationPath);
    } else {
      throw (new FileAlreadyExists(tgzDestinationPath));
    }
  }
  await fs.move(tgzOriginPath, tgzDestinationPath)
  return tgzDestinationPath;
}
