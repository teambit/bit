// @flow
import R from 'ramda';
import importComponents from 'bit-scope-client';
import path from 'path';
// import responseMock from './response-mock';
import modelOnFs from './model-on-fs';
import { componentDependencies } from './model-on-fs';
// import locateConsumer from '../consumer/locate-consumer';
import BitJson from '../bit-json';
import { MODULE_NAME, MODULES_DIR, COMPONENTS_DIRNAME, ID_DELIMITER } from '../constants';
import componentsMap from './components-map';
import * as createLinks from './create-links';
import parseBitFullId from '../bit-id/parse-bit-full-id';

 // TODO - inject bitJson instead of load it
export const readIdsFromBitJson = (consumerPath: string) =>
  new Promise((resolve, reject) => {
    try {
      const bitJson = BitJson.load(consumerPath);
      const dependencies = bitJson.getDependenciesArray();
      resolve(dependencies);
    } catch (e) { reject(e); }
  });

// TODO - inject bitJson instead of load it
export function getIdsFromBitJsonIfNeeded(componentIds: string[], consumerPath: string):
Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (!componentIds || R.isEmpty(componentIds)) {
      return readIdsFromBitJson(consumerPath)
      .then((ids) => {
        if (!ids || R.isEmpty(ids)) return resolve([]);
        return resolve(ids);
      }).catch(reject);
    }

    return resolve(componentIds);
  });
}

function saveIdsToBitJsonIfNeeded(componentIds: string[], components: componentDependencies[],
  projectBitJson: BitJson, projectRoot: string): Promise<*> {
  return new Promise((resolve, reject) => {
    if (!componentIds || R.isEmpty(componentIds)) return resolve();
    let bitJsonHasChanged = false;
    componentIds.forEach((componentId) => {
      const objId = parseBitFullId({ id: componentId });
      const strId = objId.scope + ID_DELIMITER + objId.box + ID_DELIMITER + objId.name;
      if (!projectBitJson.dependencies[strId]) {
        const component = components.find(item => item.component.scope === objId.scope
        && item.component.box === objId.box && item.component.name === objId.name);
        /* eslint no-param-reassign: ["error", { "props": false }] */
        projectBitJson.dependencies[strId] = component.component.version;
        bitJsonHasChanged = true;
      }
    });
    if (!bitJsonHasChanged) return resolve();
    projectBitJson.validateDependencies();
    return projectBitJson.write(projectRoot).then(resolve).catch(reject);
  });
}

export default (componentIds: string[]) => {
  const projectRoot = process.cwd();
  const targetModuleDir = path.join(projectRoot, MODULES_DIR, MODULE_NAME);
  const targetComponentsDir = path.join(projectRoot, COMPONENTS_DIRNAME);
  const projectBitJson = BitJson.load(projectRoot);
  projectBitJson.validateDependencies();
  let components;

  return getIdsFromBitJsonIfNeeded(componentIds, projectRoot)
  .then((ids) => { // eslint-disable-line
    return importComponents(ids);
    // return Promise.resolve(responseMock); // mock - replace to the real importer
  })
  .then((responses) => {
    components = R.unnest(responses.map(R.prop('payload')));
    return modelOnFs(components, targetComponentsDir);
  })
  .then(() => saveIdsToBitJsonIfNeeded(componentIds, components, projectBitJson, projectRoot))
  .then(() => componentsMap(targetComponentsDir))
  .then(map => createLinks.dependencies(targetComponentsDir, map))
  .then(map => createLinks.publicApi(targetModuleDir, map, projectBitJson));
};
