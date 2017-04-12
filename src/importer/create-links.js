// @flow
import fs from 'fs-extra';
import path from 'path';
import { MODULE_NAME, MODULES_DIR, COMPONENTS_DIRNAME, VERSION_DELIMITER, ID_DELIMITER } from '../constants';

const linkTemplate = (link: string): string => `module.exports = require('${link}');`;
const componentToString = (component: Object): string => component.scope + ID_DELIMITER
  + component.box + ID_DELIMITER + component.name + VERSION_DELIMITER + component.version;

function writeFile(file: string, content: string): Promise<*> {
  return new Promise((resolve, reject) => {
    fs.outputFile(file, content, (err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}

export function dependencies(targetComponentsDir: string, map: Object): Promise<Object> {
  return new Promise((resolve, reject) => {
    const promises = [];
    Object.keys(map).forEach((component) => {
      const targetModuleDir = path.join(targetComponentsDir, map[component].loc, MODULES_DIR, MODULE_NAME);
      map[component].dependencies.forEach((dependency) => {
        const [box, name] = map[dependency].loc.split(path.sep);
        const targetFile = path.join(targetModuleDir, box, name, 'index.js');
        const relativeComponentsDir = path.join(...Array(8).fill('..'));
        const dependencyDir = path.join(relativeComponentsDir, map[dependency].loc, map[dependency].file);
        promises.push(writeFile(targetFile, linkTemplate(dependencyDir)));
      });
    });
    Promise.all(promises).then(() => resolve(map)).catch(reject);
  });
}

export function publicApi(targetModuleDir: string, map: Object, components: Array<Object>): Promise<*> {
  return Promise.all(components.map(({ component }) => {
    const targetDir = path.join(targetModuleDir, component.box, component.name, 'index.js');
    const componentId = componentToString(component);
    const relativeComponentsDir = path.join(...Array(4).fill('..'), COMPONENTS_DIRNAME);
    const dependencyDir = path.join(relativeComponentsDir, map[componentId].loc, map[componentId].file);
    return writeFile(targetDir, linkTemplate(dependencyDir));
  }));
}
