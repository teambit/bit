// @flow
import path from 'path';
import BitJson from 'bit-scope-client/bit-json';
import { MODULE_NAME, MODULES_DIR, INLINE_COMPONENTS_DIRNAME, COMPONENTS_DIRNAME } from '../constants';
import * as componentsMap from '../components-map';
import * as linksGenerator from '../links-generator';
import { removeDirP } from '../utils';

export default function bindAction({ projectRoot = process.cwd() }: { projectRoot?: string}):
Promise<any> {
  const targetComponentsDir = path.join(projectRoot, COMPONENTS_DIRNAME);
  const targetModuleDir = path.join(projectRoot, MODULES_DIR, MODULE_NAME);
  const targetInlineComponentsDir = path.join(projectRoot, INLINE_COMPONENTS_DIRNAME);
  const projectBitJson = BitJson.load(projectRoot);
  const boundComponents = {};
  return removeDirP(targetModuleDir)
    .then(() => componentsMap.build(projectRoot, targetComponentsDir))
    .then(map => linksGenerator.dependencies(targetComponentsDir, map, projectBitJson)
      .then(() => linksGenerator.publicApiForExportPendingComponents(targetModuleDir, map))
      .then((components) => {
        Object.assign(boundComponents, components);
        return linksGenerator.publicApiComponentLevel(targetModuleDir, map, projectBitJson);
      })
      .then((components) => {
        Object.assign(boundComponents, components);
        return componentsMap.buildForInline(targetInlineComponentsDir, projectBitJson);
      })
      .then(inlineMap => linksGenerator
        .dependenciesForInlineComponents(targetInlineComponentsDir, map, inlineMap))
      .then(inlineMap => linksGenerator.publicApiForInlineComponents(targetModuleDir, inlineMap,
        targetInlineComponentsDir))
      .then((components) => {
        Object.assign(boundComponents, components);
        return componentsMap.buildForNamespaces(targetModuleDir);
      })
      .then(namespacesMap => linksGenerator.publicApiNamespaceLevel(targetModuleDir, namespacesMap))
      .then(namespacesMap => linksGenerator.publicApiRootLevel(targetModuleDir, namespacesMap))
      .then(() => boundComponents)
    );
}

export function bindSpecificComponentsAction({ projectRoot = process.cwd(), components }: {
  projectRoot?: string, components: Object[] }): Promise<any> {
  const targetModuleDir = path.join(projectRoot, MODULES_DIR, MODULE_NAME);
  const targetComponentsDir = path.join(projectRoot, COMPONENTS_DIRNAME);
  const componentsObj = {};
  components.forEach((component) => {
    const id = componentsMap.generateId({
      scope: component.scope,
      namespace: component.box,
      name: component.name,
      version: component.version });
    componentsObj[id] = component;
  });
  // for simplicity, it's better to build the map of the entire folder. Otherwise, if this specific
  // component has dependencies, it will require recursive checking of all dependencies
  return componentsMap.build(projectRoot, targetComponentsDir)
    .then(map => linksGenerator
      .dependenciesForSpecificComponents(targetComponentsDir, map, componentsObj))
    .then(map => linksGenerator
      .publicApiComponentLevelForSpecificComponents(targetModuleDir, map, componentsObj))
    .then(() => componentsMap.buildForNamespaces(targetModuleDir))
    .then(namespacesMap => linksGenerator.publicApiNamespaceLevel(targetModuleDir, namespacesMap))
    .then(namespacesMap => linksGenerator.publicApiRootLevel(targetModuleDir, namespacesMap));
}
