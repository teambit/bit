// @flow
import path from 'path';
import BitJson from 'bit-scope-client/bit-json';
import { MODULE_NAME, MODULES_DIR, INLINE_COMPONENTS_DIRNAME, COMPONENTS_DIRNAME } from '../constants';
import * as componentsMap from '../components-map';
import * as linksGenerator from '../links-generator';
import { removeDirP } from '../utils';

export default function bindAction(): Promise<any> {
  const projectRoot = process.cwd();
  const targetComponentsDir = path.join(projectRoot, COMPONENTS_DIRNAME);
  const targetModuleDir = path.join(projectRoot, MODULES_DIR, MODULE_NAME);
  const targetInlineComponentsDir = path.join(projectRoot, INLINE_COMPONENTS_DIRNAME);
  const projectBitJson = BitJson.load(projectRoot);
  const boundComponents = {};
  return removeDirP(targetModuleDir)
    .then(() => componentsMap.build(projectRoot, targetComponentsDir))
    .then(map => linksGenerator.dependencies(targetComponentsDir, map, projectBitJson))
    .then(map => linksGenerator.publicApiForExportPendingComponents(targetModuleDir, map))
    .then(({ map, components }) => {
      Object.assign(boundComponents, components);
      return linksGenerator.publicApiComponentLevel(targetModuleDir, map, projectBitJson);
    })
    .then((components) => {
      Object.assign(boundComponents, components);
      return componentsMap.buildForInline(targetInlineComponentsDir, projectBitJson);
    })
    .then(inlineMap => linksGenerator.publicApiForInlineComponents(targetModuleDir, inlineMap))
    .then((components) => {
      Object.assign(boundComponents, components);
      return componentsMap.buildForNamespaces(targetModuleDir);
    })
    .then(namespacesMap => linksGenerator.publicApiNamespaceLevel(targetModuleDir, namespacesMap))
    .then(namespacesMap => linksGenerator.publicApiRootLevel(targetModuleDir, namespacesMap))
    .then(() => boundComponents);
}
