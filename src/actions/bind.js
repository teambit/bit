// @flow
import path from 'path';
import { mergeAll } from 'ramda';
import BitJson from 'bit-scope-client/bit-json';
import { MODULE_NAME, MODULES_DIR, INLINE_COMPONENTS_DIRNAME, COMPONENTS_DIRNAME } from '../constants';
import * as ComponentsMap from '../components-map';
import * as LinksGenerator from '../links-generator';
import { removeDirP } from '../utils';

export default async function bindAction({ projectRoot = process.cwd() }: { projectRoot?: string}):
Promise<any> {
  const componentsDir = path.join(projectRoot, COMPONENTS_DIRNAME);
  const moduleDir = path.join(projectRoot, MODULES_DIR, MODULE_NAME);
  const inlineComponentsDir = path.join(projectRoot, INLINE_COMPONENTS_DIRNAME);
  const projectBitJson = BitJson.load(projectRoot);
  await removeDirP(moduleDir);

  const [componentsMap, inlineComponentMap] = await Promise.all([
    ComponentsMap.build(projectRoot, componentsDir),
    ComponentsMap.buildForInline(inlineComponentsDir, projectBitJson),
  ]);

  const componentsDependenciesLinks = await LinksGenerator
  .componentsDependencies(componentsDir, componentsMap, inlineComponentMap, projectBitJson);

  const stagedComponentsLinks = await LinksGenerator
  .publicApiForExportPendingComponents(moduleDir, componentsMap);

  const publicApiComponentsLinks = await LinksGenerator
  .publicApiComponentLevel(moduleDir, componentsMap, projectBitJson);

  const inlineComponentsDependenciesLinks = await LinksGenerator
  .dependenciesForInlineComponents(inlineComponentsDir, componentsMap, inlineComponentMap);

  const publicApiInlineComponentsLinks = await LinksGenerator
  .publicApiForInlineComponents(moduleDir, inlineComponentMap, inlineComponentsDir);

  const namespacesMap = await ComponentsMap.buildForNamespaces(moduleDir);

  await LinksGenerator.publicApiNamespaceLevel(moduleDir, namespacesMap);
  await LinksGenerator.publicApiRootLevel(moduleDir, namespacesMap);

  return mergeAll([
    stagedComponentsLinks,
    publicApiComponentsLinks,
    publicApiInlineComponentsLinks,
  ]);
}

export function bindSpecificComponentsAction({ projectRoot = process.cwd(), components }: {
  projectRoot?: string, components: Object[] }): Promise<any> {
  const targetModuleDir = path.join(projectRoot, MODULES_DIR, MODULE_NAME);
  const targetComponentsDir = path.join(projectRoot, COMPONENTS_DIRNAME);
  const componentsObj = {};
  components.forEach((component) => {
    const id = ComponentsMap.generateId({
      scope: component.scope,
      namespace: component.box,
      name: component.name,
      version: component.version });
    componentsObj[id] = component;
  });
  // for simplicity, it's better to build the map of the entire folder. Otherwise, if this specific
  // component has dependencies, it will require recursive checking of all dependencies
  return ComponentsMap.build(projectRoot, targetComponentsDir)
    .then(map => LinksGenerator
      .dependenciesForSpecificComponents(targetComponentsDir, map, componentsObj))
    .then(map => LinksGenerator
      .publicApiComponentLevelForSpecificComponents(targetModuleDir, map, componentsObj))
    .then(() => ComponentsMap.buildForNamespaces(targetModuleDir))
    .then(namespacesMap => LinksGenerator.publicApiNamespaceLevel(targetModuleDir, namespacesMap))
    .then(namespacesMap => LinksGenerator.publicApiRootLevel(targetModuleDir, namespacesMap));
}
