// @flow
import fs from 'fs-extra';
import path from 'path';
import BitJson from '../bit-json';
import { MODULE_NAME, MODULES_DIR, COMPONENTS_DIRNAME, VERSION_DELIMITER, ID_DELIMITER } from '../constants';

const linkTemplate = (link: string): string => `module.exports = require('${link}');`;

function writeFile(file: string, content: string): Promise<*> {
  return new Promise((resolve, reject) => {
    fs.outputFile(file, content, (err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}

function remove(dir: string): Promise<*> {
  return new Promise((resolve, reject) => {
    fs.remove(dir, (err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}

export function dependencies(targetComponentsDir: string, map: Object): Promise<Object> {
  return new Promise((resolve, reject) => {
    const promises = [];
    Object.keys(map).forEach((component) => {
      const targetModuleDir = path.join(
        targetComponentsDir,
        map[component].loc,
        MODULES_DIR,
        MODULE_NAME,
      );

      map[component].dependencies.forEach((dependency) => {
        const [box, name] = map[dependency].loc.split(path.sep);
        const targetFile = path.join(targetModuleDir, box, name, 'index.js');
        const relativeComponentsDir = path.join(...Array(8).fill('..'));
        const dependencyDir = path.join(
          relativeComponentsDir,
          map[dependency].loc,
          map[dependency].file,
        );

        promises.push(writeFile(targetFile, linkTemplate(dependencyDir)));
      });
    });
    Promise.all(promises).then(() => resolve(map)).catch(reject);
  });
}

export function publicApi(targetModuleDir: string, map: Object, projectBitJson: BitJson):
Promise<*> {
  return remove(targetModuleDir)
    .then(() => Promise.all(Object.keys(projectBitJson.dependencies).map((id) => {
      const [, box, name] = id.split(ID_DELIMITER);
      const targetDir = path.join(targetModuleDir, box, name, 'index.js');
      const mapId = id + VERSION_DELIMITER + projectBitJson.dependencies[id];
      const relativeComponentsDir = path.join(...Array(4).fill('..'), COMPONENTS_DIRNAME);
      // TODO: what happens when a component is not on the FS.
      const dependencyDir = path.join(relativeComponentsDir, map[mapId].loc, map[mapId].file);
      return writeFile(targetDir, linkTemplate(dependencyDir));
    })));
}
