// @flow
import fs from 'fs-extra';
import path from 'path';
import R from 'ramda';
import BitJson from 'bit-scope-client/bit-json';
import { MODULE_NAME,
  MODULES_DIR,
  COMPONENTS_DIRNAME,
  VERSION_DELIMITER,
  ID_DELIMITER,
  INLINE_COMPONENTS_DIRNAME } from '../constants';

const linkTemplate = (link: string): string => `module.exports = require('${link}');`;

function writeFileP(file: string, content: string): Promise<*> {
  return new Promise((resolve, reject) => {
    fs.outputFile(file, content, (err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}

function removeDirP(dir: string): Promise<*> {
  return new Promise((resolve, reject) => {
    fs.remove(dir, (err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}

function findAllDependenciesInComponentMap(componentsMap: Object, components: Array<string>,
  dependenciesArr: Array<string> = []) {
  components.forEach((component) => {
    if (componentsMap[component] && componentsMap[component].dependencies.length) {
      findAllDependenciesInComponentMap(
        componentsMap,
        componentsMap[component].dependencies,
        dependenciesArr.concat(componentsMap[component].dependencies));
    }
  });
  return dependenciesArr;
}

function filterNonReferencedComponents(
  componentsMap: Object, projectBitJson: BitJson,
): Array<string> {
  if (
    !projectBitJson.dependencies ||
    R.isEmpty(projectBitJson.dependencies) ||
    !componentsMap ||
    R.isEmpty(componentsMap)
  ) return [];

  const bitJsonComponents = projectBitJson.getDependenciesArray();
  const componentsOnFS = Object.keys(componentsMap);
  const components = componentsOnFS.filter(component => bitJsonComponents.includes(component));
  const componentDependencies = findAllDependenciesInComponentMap(componentsMap, bitJsonComponents);
  return R.uniq(components.concat(componentDependencies));
}

export function dependencies(
  targetComponentsDir: string, map: Object, projectBitJson: BitJson,
): Promise<Object> {
  return new Promise((resolve, reject) => {
    const promises = [];
    const components = filterNonReferencedComponents(map, projectBitJson);
    components.forEach((component) => {
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

        promises.push(writeFileP(targetFile, linkTemplate(dependencyDir)));
      });
    });
    Promise.all(promises).then(() => resolve(map)).catch(reject);
  });
}

export function publicApiForInlineComponents(targetModuleDir: string, inlineMap: Object) {
  if (!inlineMap || R.isEmpty(inlineMap)) return Promise.resolve();

  return Promise.all(Object.keys(inlineMap).map((id) => {
    const [box, name] = id.split(path.sep);
    const targetDir = path.join(targetModuleDir, box, name, 'index.js');
    const relativeComponentsDir = path.join(...Array(4).fill('..'), INLINE_COMPONENTS_DIRNAME);
    const dependencyDir = path.join(relativeComponentsDir, inlineMap[id].loc, inlineMap[id].file);
    return writeFileP(targetDir, linkTemplate(dependencyDir));
  }));
}

export function publicApi(targetModuleDir: string, map: Object, projectBitJson: BitJson):
Promise<*> {
  if (!projectBitJson.dependencies || R.isEmpty(projectBitJson.dependencies)) {
    return Promise.resolve();
  }

  return removeDirP(targetModuleDir).then(() => {
    const writeAllFiles = Object.keys(projectBitJson.dependencies).map((id) => {
      const [, box, name] = id.split(ID_DELIMITER);
      const targetDir = path.join(targetModuleDir, box, name, 'index.js');
      const mapId = id + VERSION_DELIMITER + projectBitJson.dependencies[id];
      const relativeComponentsDir = path.join(...Array(4).fill('..'), COMPONENTS_DIRNAME);
      if (!map[mapId]) return Promise.resolve(); // the file is in bit.json but not fetched yet
      const dependencyDir = path.join(relativeComponentsDir, map[mapId].loc, map[mapId].file);
      return writeFileP(targetDir, linkTemplate(dependencyDir));
    });
    return Promise.all(writeAllFiles);
  });
}
