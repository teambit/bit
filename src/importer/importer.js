// @flow
import R from 'ramda';
import importComponents from 'bit-scope-client';
import path from 'path';
import responseMock from './response-mock';
import modelOnFs from './model-on-fs';
// import locateConsumer from '../consumer/locate-consumer';
import BitJson from '../bit-json';
import { MODULE_NAME, MODULES_DIR, COMPONENTS_DIRNAME } from '../constants';

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

export const createMapFromComponents = (targetComponentsDir) => {
  // TODO - using the components map class
  return Promise.resolve();
};

export const createDependencyLinks = (targetComponentsDir, map) => {
  // TODO - implement
  return Promise.resolve();
};

export const createPublicApi = (targetModuleDir, map, projectBitJson) => {
  // TODO - implement
  return Promise.resolve();
};

export default (componentIds: string[]) => {
  // TODO - replace with cwd this is mock
  const projectRoot = '/Users/ran/bit-playground/consumers/test-bit-js' || process.cwd();
  const targetModuleDir = path.join(projectRoot, MODULES_DIR, MODULE_NAME);
  const targetComponentsDir = path.join(projectRoot, COMPONENTS_DIRNAME);
  const projectBitJson = BitJson.load(projectRoot);

  return getIdsFromBitJsonIfNeeded(componentIds, projectRoot)
  .then((ids) => { // eslint-disable-line
    // return importComponents(ids);
    return Promise.resolve(responseMock); // mock - replace to the real importer
  })
  .then((responses) => {
    const componentDependenciesArr = R.unnest(responses.map(R.prop('payload')));
    return modelOnFs(componentDependenciesArr, targetComponentsDir);
  })
  .then(() => createMapFromComponents(targetComponentsDir))
  .then(map => createDependencyLinks(targetComponentsDir, map))
  .then(map => createPublicApi(targetModuleDir, map, projectBitJson));
};
