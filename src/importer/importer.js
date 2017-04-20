// @flow
import R from 'ramda';
import { importComponents } from 'bit-scope-client';
import path from 'path';
import BitJson from 'bit-scope-client/bit-json';
// import responseMock from './response-mock';
// import locateConsumer from '../consumer/locate-consumer';
import { MODULE_NAME, MODULES_DIR, COMPONENTS_DIRNAME, INLINE_COMPONENTS_DIRNAME, ID_DELIMITER,
  DEFAULT_IMPL_NAME, DEFAULT_SPECS_NAME, NO_PLUGIN_TYPE, DEFAULT_COMPILER_ID, DEFAULT_TESTER_ID,
  DEFAULT_MISC_FILES, DEFAULT_DEPENDENCIES } from '../constants';
import * as componentsMap from './components-map';
import * as linksGenerator from './links-generator';
import watch from './watch';

const projectRoot = process.cwd();
const targetComponentsDir = path.join(projectRoot, COMPONENTS_DIRNAME);

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

export function bindAction(): Promise<any> {
  const targetModuleDir = path.join(projectRoot, MODULES_DIR, MODULE_NAME);
  const targetInlineComponentsDir = path.join(projectRoot, INLINE_COMPONENTS_DIRNAME);
  const projectBitJson = BitJson.load(projectRoot);
  return componentsMap.build(targetComponentsDir)
    .then(map => linksGenerator.dependencies(targetComponentsDir, map, projectBitJson))
    .then(map => linksGenerator.publicApi(targetModuleDir, map, projectBitJson))
    .then(() => componentsMap.buildForInline(targetInlineComponentsDir, projectBitJson))
    .then(inlineMap => linksGenerator.publicApiForInlineComponents(targetModuleDir, inlineMap));
}

const defaultProjectBitJson = {
  impl: DEFAULT_IMPL_NAME,
  spec: DEFAULT_SPECS_NAME,
  misc: DEFAULT_MISC_FILES,
  compiler: DEFAULT_COMPILER_ID,
  tester: DEFAULT_TESTER_ID,
  dependencies: DEFAULT_DEPENDENCIES,
};

export function fetchAction(componentIds: string[]): Promise<any> {
  const projectBitJson = BitJson.load(projectRoot, defaultProjectBitJson);
  try {
    projectBitJson.validateDependencies();
  } catch (e) {
    return Promise.reject(e);
  }

  return getIdsFromBitJsonIfNeeded(componentIds, projectRoot)
  .then((ids) => { // eslint-disable-line
    return importComponents(ids, true); // import and save to bitJson
    // return Promise.resolve(responseMock); // mock - replace to the real importer
  });
}

export function watchAction(): Promise<any> {
  return watch(projectRoot);
}

export function importAction(componentIds: string[]): Promise<any> {
  return fetchAction(componentIds).then(bindAction);
}
