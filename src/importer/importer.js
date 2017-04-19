// @flow
import R from 'ramda';
import { importComponents } from 'bit-scope-client';
import path from 'path';
import { parseBitFullId } from 'bit-scope-client/bit-id';
import BitJson from 'bit-scope-client/bit-json';
// import responseMock from './response-mock';
// import locateConsumer from '../consumer/locate-consumer';
import { MODULE_NAME, MODULES_DIR, COMPONENTS_DIRNAME, INLINE_COMPONENTS_DIRNAME, ID_DELIMITER,
  DEFAULT_IMPL_NAME, DEFAULT_SPECS_NAME, NO_PLUGIN_TYPE, DEFAULT_COMPILER_ID, DEFAULT_TESTER_ID,
  DEFAULT_MISC_FILES, DEFAULT_DEPENDENCIES } from '../constants';
import * as componentsMap from './components-map';
import * as createLinks from './create-links';
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

function saveIdsToBitJsonIfNeeded(componentIds: string[], components: Object[],
  projectBitJson: BitJson): Promise<*> {
  return new Promise((resolve, reject) => {
    if (!componentIds || R.isEmpty(componentIds)) return resolve();
    let bitJsonHasChanged = false;
    componentIds.forEach((componentId) => {
      const objId = parseBitFullId({ id: componentId });
      const strId = objId.scope + ID_DELIMITER + objId.box + ID_DELIMITER + objId.name;
      if (projectBitJson.dependencies && !projectBitJson.dependencies[strId]) {
        const component = components.find(item => item.component.scope === objId.scope
        && item.component.box === objId.box && item.component.name === objId.name);
        /* eslint no-param-reassign: ["error", { "props": false }] */
        projectBitJson.dependencies[strId] = component && component.component.version;
        bitJsonHasChanged = true;
      }
    });
    if (!bitJsonHasChanged) return resolve();
    try {
      projectBitJson.validateDependencies();
    } catch (e) {
      return reject(e);
    }

    return projectBitJson.write(projectRoot).then(resolve).catch(reject);
  });
}

export function bindAction(): Promise<any> {
  const targetModuleDir = path.join(projectRoot, MODULES_DIR, MODULE_NAME);
  const targetInlineComponentsDir = path.join(projectRoot, INLINE_COMPONENTS_DIRNAME);
  const projectBitJson = BitJson.load(projectRoot);
  return componentsMap.build(targetComponentsDir)
    .then(map => createLinks.dependencies(targetComponentsDir, map, projectBitJson))
    .then(map => createLinks.publicApi(targetModuleDir, map, projectBitJson))
    .then(() => componentsMap.buildForInline(targetInlineComponentsDir, projectBitJson))
    .then(inlineMap => createLinks.publicApiForInlineComponents(targetModuleDir, inlineMap));
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
    return importComponents(ids);
    // return Promise.resolve(responseMock); // mock - replace to the real importer
  })
  .then(components => saveIdsToBitJsonIfNeeded(componentIds,
    components, projectBitJson, projectRoot));
}

export function watchAction(): Promise<any> {
  return watch(projectRoot);
}

export function importAction(componentIds: string[]): Promise<any> {
  return fetchAction(componentIds).then(bindAction);
}
