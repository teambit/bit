// @flow
import R from 'ramda';
import importComponents from 'bit-scope-client';
import path from 'path';
import responseMock from './response-mock';
import modelOnFs from './model-on-fs';
// import locateConsumer from '../consumer/locate-consumer';
import BitJson from '../bit-json';
import { MODULE_NAME, MODULES_DIR, COMPONENTS_DIRNAME } from '../constants';
import componentsMap from './components-map';
import * as createLinks from './create-links';

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

export default (componentIds: string[]) => {
  // TODO - replace with cwd this is mock
  // const projectRoot = '/Users/ran/bit-playground/consumers/test-bit-js' || process.cwd();
  const projectRoot = process.cwd();
  const targetModuleDir = path.join(projectRoot, MODULES_DIR, MODULE_NAME);
  const targetComponentsDir = path.join(projectRoot, COMPONENTS_DIRNAME);
  const projectBitJson = BitJson.load(projectRoot);
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
  .then(() => componentsMap(targetComponentsDir))
  .then(map => createLinks.dependencies(targetComponentsDir, map))
  .then(map => createLinks.publicApi(targetModuleDir, map, components));
};
