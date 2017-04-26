// @flow
import R from 'ramda';
import { importComponents } from 'bit-scope-client';
import BitJson from 'bit-scope-client/bit-json';
import { DEFAULT_IMPL_NAME, DEFAULT_SPECS_NAME, DEFAULT_COMPILER_ID,
  DEFAULT_TESTER_ID, DEFAULT_MISC_FILES, DEFAULT_DEPENDENCIES } from '../constants';
// import responseMock from '../../mocks/response-mock';

const defaultProjectBitJson = {
  impl: DEFAULT_IMPL_NAME,
  spec: DEFAULT_SPECS_NAME,
  misc: DEFAULT_MISC_FILES,
  compiler: DEFAULT_COMPILER_ID,
  tester: DEFAULT_TESTER_ID,
  dependencies: DEFAULT_DEPENDENCIES,
};

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

export default function fetchAction(componentIds: string[]): Promise<any> {
  const projectRoot = process.cwd();
  const projectBitJson = BitJson.load(projectRoot, defaultProjectBitJson);
  try {
    projectBitJson.validateDependencies();
  } catch (e) {
    return Promise.reject(e);
  }

  return getIdsFromBitJsonIfNeeded(componentIds, projectRoot)
  .then((ids) => { // eslint-disable-line
    return importComponents(ids, true) // import and save to bitJson
      .then(() => ids);
    // return Promise.resolve(responseMock); // mock - replace to the real importer
  });
}
