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
  return removeDirP(targetModuleDir)
    .then(() => componentsMap.build(projectRoot, targetComponentsDir))
    .then(map => linksGenerator.dependencies(targetComponentsDir, map, projectBitJson))
    .then(map => linksGenerator.publicApiForExportPendingComponents(targetModuleDir, map))
    .then(map => linksGenerator.publicApiComponentLevel(targetModuleDir, map, projectBitJson))
    .then(() => componentsMap.buildForInline(targetInlineComponentsDir, projectBitJson))
    .then(inlineMap => linksGenerator.publicApiForInlineComponents(targetModuleDir, inlineMap))
    .then(() => linksGenerator.publicApiNamespaceLevel(targetModuleDir))
    .then(namespaces => linksGenerator.publicApiRootLevel(targetModuleDir, namespaces));
}
