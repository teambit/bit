/** @flow */
import R from 'ramda';
import Component from '../../../consumer/component';
import { COMPONENT_ORIGINS } from '../../../constants';
import loader from '../../../cli/loader';
import { BEFORE_LOADING_COMPONENTS } from '../../../cli/loader/loader-messages';
import type { ExtensionContext } from '../../extensions-loader';
import buildComponent from './build-component';

type Workspace = $PropertyType<ExtensionContext, 'workspace'>;

export async function build(
  context: ExtensionContext,
  id: string,
  noCache: boolean,
  verbose: boolean
): Promise<?Array<string>> {
  const workspace: Workspace = context.workspace;
  const bitId = workspace.getBitIdFromString(id);
  const [component: Component] = await workspace.loadComponents([bitId]);
  const result = await buildComponent({ component, store: workspace.scope, noCache, workspace, verbose });
  if (result === null) return null;
  const distFilePaths = await component.dists.writeDists(component, workspace);
  workspace.bitMap.addMainDistFileToComponent(component.id, distFilePaths);
  await workspace.onDestroy();
  return distFilePaths;
}

export async function buildAll(context: ExtensionContext, noCache: boolean, verbose: boolean): Promise<Object> {
  const workspace: Workspace = context.workspace;
  const authoredAndImportedIds = workspace.bitMap.getAllBitIds([
    COMPONENT_ORIGINS.IMPORTED,
    COMPONENT_ORIGINS.AUTHORED
  ]);
  if (R.isEmpty(authoredAndImportedIds)) throw new Error('nothing to build');

  loader.start(BEFORE_LOADING_COMPONENTS);
  const { components } = await workspace.loadComponents(authoredAndImportedIds);
  loader.stop();
  const buildAllP = await workspace.scope.buildMultiple(components, workspace, noCache, verbose);
  const allComponents = await Promise.all(buildAllP);
  const componentsObj = {};
  allComponents.forEach((component) => {
    componentsObj[component.component] = component.buildResults;
  });
  await workspace.onDestroy();
  return componentsObj;
}
