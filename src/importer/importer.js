// @flow
import R from 'ramda';
// import importComponents from 'bit-scope-client';
import componentsMock from './component-mock';
import modelOnFs from './model-on-fs';
import locateConsumer from '../consumer/locate-consumer';
import BitJson from '../bit-json';

export const readIdsFromBitJson = (consumerPath: string) =>
  new Promise((resolve, reject) => {
    try {
      const bitJson = BitJson.load(consumerPath);
      const dependencies = bitJson.getDependenciesArray();
      resolve(dependencies);
    } catch (e) { reject(e); }
  });

export function getIdsFromBitJsonIfNeeded(componentIds: string[], consumerPath: string):
Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (!componentIds || R.isEmpty(componentIds)) {
      return readIdsFromBitJson(consumerPath)
      .then((ids) => {
        if (!ids || R.isEmpty(ids)) return [];
        return resolve(ids);
      }).catch(reject);
    }

    return resolve(componentIds);
  });
}

export default (componentIds: string[]) => {
  // TODO - replace with cwd this is mock
  const currentDir = '/Users/ran/Projects/bit-scope-client' || process.cwd();
  const consumerPath = locateConsumer(currentDir);

  return getIdsFromBitJsonIfNeeded(componentIds, consumerPath)
  .then((ids) => { // eslint-disable-line
    // return importComponents(ids);
    return Promise.resolve(componentsMock); // mock - replace to the real importer
  }).then(componentDependencies => modelOnFs(componentDependencies, consumerPath));
};
