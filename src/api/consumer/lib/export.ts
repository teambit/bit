import fs from 'fs-extra';
import mapSeries from 'p-map-series';
import * as path from 'path';
import R from 'ramda';
import yn from 'yn';

import { Analytics } from '../../../analytics/analytics';
import { BitId, BitIds } from '../../../bit-id';
import loader from '../../../cli/loader';
import { BEFORE_EXPORT, BEFORE_EXPORTS, BEFORE_LOADING_COMPONENTS } from '../../../cli/loader/loader-messages';
import { COMPONENT_ORIGINS, DEFAULT_BINDINGS_PREFIX, POST_EXPORT_HOOK, PRE_EXPORT_HOOK } from '../../../constants';
import { Consumer, loadConsumer } from '../../../consumer';
import BitMap from '../../../consumer/bit-map/bit-map';
import EjectComponents, { EjectResults } from '../../../consumer/component-ops/eject-components';
import ManyComponentsWriter from '../../../consumer/component-ops/many-components-writer';
import ComponentsList from '../../../consumer/component/components-list';
import Component from '../../../consumer/component/consumer-component';
import * as packageJsonUtils from '../../../consumer/component/package-json-utils';
import {
  getLaneCompIdsToExport,
  isUserTryingToExportLanes,
  updateLanesAfterExport,
} from '../../../consumer/lanes/export-lanes';
import GeneralError from '../../../error/general-error';
import HooksManager from '../../../hooks';
import { NodeModuleLinker } from '../../../links';
import logger from '../../../logger/logger';
import { forkComponentsPrompt } from '../../../prompts';
import { exportMany } from '../../../scope/component-ops/export-scope-components';
import { Lane } from '../../../scope/models';
import hasWildcard from '../../../utils/string/has-wildcard';
import IdExportedAlready from './exceptions/id-exported-already';
import { LanesIsDisabled } from '../../../consumer/lanes/exceptions/lanes-is-disabled';
import { Scope } from '../../../scope';

const HooksManagerInstance = HooksManager.getInstance();

type DefaultScopeGetter = (id: BitId) => Promise<string | undefined>;

let getDefaultScope: DefaultScopeGetter;
export function registerDefaultScopeGetter(func: DefaultScopeGetter) {
  getDefaultScope = func;
}

type ExportParams = {
  ids: string[];
  remote: string | null | undefined;
  eject: boolean;
  includeDependencies: boolean;
  setCurrentScope: boolean;
  allVersions: boolean;
  originDirectly: boolean;
  includeNonStaged: boolean;
  codemod: boolean;
  force: boolean;
  lanes: boolean;
  resumeExportId: string | undefined;
};

export default async function exportAction(params: ExportParams) {
  HooksManagerInstance.triggerHook(PRE_EXPORT_HOOK, params);
  const { updatedIds, nonExistOnBitMap, missingScope, exported, exportedLanes } = await exportComponents(params);
  let ejectResults;
  if (params.eject) ejectResults = await ejectExportedComponents(updatedIds);
  const exportResults = {
    componentsIds: exported,
    nonExistOnBitMap,
    missingScope,
    ejectResults,
    exportedLanes,
  };
  HooksManagerInstance.triggerHook(POST_EXPORT_HOOK, exportResults);
  if (Scope.onPostExport) {
    await Scope.onPostExport(exported, exportedLanes).catch((err) => {
      logger.error('fatal: onPostExport encountered an error (this error does not stop the process)', err);
    });
  }
  return exportResults;
}

async function exportComponents({
  ids,
  remote,
  includeDependencies,
  setCurrentScope,
  includeNonStaged,
  codemod,
  force,
  lanes,
  allVersions,
  originDirectly,
  resumeExportId,
}: ExportParams): Promise<{
  updatedIds: BitId[];
  nonExistOnBitMap: BitId[];
  missingScope: BitId[];
  exported: BitId[];
  exportedLanes: Lane[];
  newIdsOnRemote: BitId[];
}> {
  const consumer: Consumer = await loadConsumer();
  if (consumer.isLegacy && lanes) throw new LanesIsDisabled();
  if (!consumer.isLegacy && !lanes && remote) {
    // on Harmony, we don't allow to specify a remote (except lanes), it exports to the default-scope
    ids.push(remote);
    remote = null;
  }
  const { idsToExport, missingScope, idsWithFutureScope, lanesObjects } = await getComponentsToExport(
    ids,
    consumer,
    remote,
    includeNonStaged,
    force,
    lanes
  );

  if (R.isEmpty(idsToExport)) {
    return { updatedIds: [], nonExistOnBitMap: [], missingScope, exported: [], newIdsOnRemote: [], exportedLanes: [] };
  }
  let componentsToExport: Component[] | undefined;
  if (codemod) {
    await _throwForModified(consumer, idsToExport);
    const { components } = await consumer.loadComponents(idsToExport);
    componentsToExport = components;
  }

  const { exported, updatedLocally, newIdsOnRemote } = await exportMany({
    scope: consumer.scope,
    isLegacy: consumer.isLegacy,
    ids: idsToExport,
    remoteName: remote,
    includeDependencies,
    changeLocallyAlthoughRemoteIsDifferent: setCurrentScope,
    codemod,
    lanesObjects,
    allVersions,
    originDirectly,
    idsWithFutureScope,
    resumeExportId,
  });
  if (lanesObjects) await updateLanesAfterExport(consumer, lanesObjects);
  const { updatedIds, nonExistOnBitMap } = _updateIdsOnBitMap(consumer.bitMap, updatedLocally);
  await linkComponents(updatedIds, consumer);
  Analytics.setExtraData('num_components', exported.length);
  if (codemod) {
    await reImportComponents(consumer, updatedIds);
    if (!componentsToExport) throw new Error('componentsToExport was not populated');
    await cleanOldComponents(consumer, BitIds.fromArray(updatedIds), componentsToExport);
  }
  // it is important to have consumer.onDestroy() before running the eject operation, we want the
  // export and eject operations to function independently. we don't want to lose the changes to
  // .bitmap file done by the export action in case the eject action has failed.
  await consumer.onDestroy();
  return { updatedIds, nonExistOnBitMap, missingScope, exported, newIdsOnRemote, exportedLanes: lanesObjects || [] };
}

function _updateIdsOnBitMap(bitMap: BitMap, componentsIds: BitIds): { updatedIds: BitId[]; nonExistOnBitMap: BitIds } {
  const updatedIds = [];
  const nonExistOnBitMap = new BitIds();
  componentsIds.forEach((componentsId) => {
    const resultId = bitMap.updateComponentId(componentsId, true);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (resultId.hasVersion()) updatedIds.push(resultId);
    else nonExistOnBitMap.push(resultId);
  });
  return { updatedIds, nonExistOnBitMap };
}

async function getComponentsToExport(
  ids: string[],
  consumer: Consumer,
  remote: string | null | undefined,
  includeNonStaged: boolean,
  force: boolean,
  lanes: boolean
): Promise<{ idsToExport: BitIds; missingScope: BitId[]; idsWithFutureScope: BitIds; lanesObjects?: Lane[] }> {
  const componentsList = new ComponentsList(consumer);
  const idsHaveWildcard = hasWildcard(ids);
  const filterNonScopeIfNeeded = async (
    bitIds: BitIds
  ): Promise<{ idsToExport: BitIds; missingScope: BitId[]; idsWithFutureScope: BitIds }> => {
    const idsWithFutureScope = await getIdsWithFutureScope(bitIds, consumer, remote);
    if (remote) return { idsToExport: bitIds, missingScope: [], idsWithFutureScope };
    const [idsToExport, missingScope] = R.partition((id) => {
      const idWithFutureScope = idsWithFutureScope.searchWithoutScopeAndVersion(id);
      if (!idWithFutureScope) throw new Error(`idsWithFutureScope is missing ${id.toString()}`);
      return idWithFutureScope.hasScope();
    }, bitIds);
    return { idsToExport: BitIds.fromArray(idsToExport), missingScope, idsWithFutureScope };
  };
  const promptForFork = async (bitIds: BitIds | BitId[]) => {
    if (force || !remote) return;
    const idsToFork = bitIds.filter((id) => id.scope && id.scope !== remote);
    if (!idsToFork.length) return;
    const forkPromptResult = await forkComponentsPrompt(idsToFork, remote)();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!yn(forkPromptResult.shouldFork)) {
      throw new GeneralError('the operation has been canceled');
    }
  };
  if (isUserTryingToExportLanes(consumer, ids, lanes)) {
    const { componentsToExport, lanesObjects } = await getLaneCompIdsToExport(consumer, ids, includeNonStaged);
    await promptForFork(componentsToExport);
    const loaderMsg = componentsToExport.length > 1 ? BEFORE_EXPORTS : BEFORE_EXPORT;
    loader.start(loaderMsg);
    const filtered = await filterNonScopeIfNeeded(componentsToExport);
    return { ...filtered, lanesObjects: lanesObjects.filter((l) => l) };
  }
  if (!ids.length || idsHaveWildcard) {
    loader.start(BEFORE_LOADING_COMPONENTS);
    const exportPendingComponents: BitIds = includeNonStaged
      ? await componentsList.listNonNewComponentsIds()
      : await componentsList.listExportPendingComponentsIds();
    const componentsToExport = idsHaveWildcard
      ? ComponentsList.filterComponentsByWildcard(exportPendingComponents, ids)
      : exportPendingComponents;
    await promptForFork(componentsToExport);
    const loaderMsg = componentsToExport.length > 1 ? BEFORE_EXPORTS : BEFORE_EXPORT;
    loader.start(loaderMsg);
    return filterNonScopeIfNeeded(componentsToExport);
  }
  loader.start(BEFORE_EXPORT); // show single export
  const parsedIds = await Promise.all(ids.map((id) => getParsedId(consumer, id)));
  const statuses = await consumer.getManyComponentsStatuses(parsedIds);
  statuses.forEach(({ id, status }) => {
    if (status.nested) {
      throw new GeneralError(
        `unable to export "${id.toString()}", the component is not fully available. please use "bit import" first`
      );
    }
    // don't allow to re-export an exported component unless it's being exported to another scope
    if (remote && !status.staged && id.scope === remote) {
      throw new IdExportedAlready(id.toString(), remote);
    }
  });
  await promptForFork(parsedIds);
  return filterNonScopeIfNeeded(BitIds.fromArray(parsedIds));
}

async function getIdsWithFutureScope(ids: BitIds, consumer: Consumer, remote?: string | null): Promise<BitIds> {
  const workspaceDefaultScope = consumer.config.defaultScope;
  let workspaceDefaultOwner = consumer.config.defaultOwner;
  // For backward computability don't treat the default binding prefix as real owner
  if (workspaceDefaultOwner === DEFAULT_BINDINGS_PREFIX) {
    workspaceDefaultOwner = undefined;
  }

  const idsArrayP = ids.map(async (id) => {
    if (remote) return id.changeScope(remote);
    if (id.hasScope()) return id;
    let finalScope = workspaceDefaultScope;
    if (consumer.isLegacy) {
      const overrides = consumer.config.getComponentConfig(id);
      const componentDefaultScope = overrides ? overrides.defaultScope : null;
      // TODO: handle separation of owner from default scope on component
      // TODO: handle owner of component
      finalScope = componentDefaultScope || finalScope;
      if (workspaceDefaultScope && workspaceDefaultOwner && !componentDefaultScope) {
        finalScope = `${workspaceDefaultOwner}.${workspaceDefaultScope}`;
      }
      return id.changeScope(finalScope);
    }
    if (getDefaultScope && typeof getDefaultScope === 'function') {
      finalScope = await getDefaultScope(id);
      if (finalScope) {
        return id.changeScope(finalScope);
      }
    }
    return id;
  });
  const idsArray = await Promise.all(idsArrayP);
  return BitIds.fromArray(idsArray);
}

async function getParsedId(consumer: Consumer, id: string): Promise<BitId> {
  // reason why not calling `consumer.getParsedId()` first is because a component might not be on
  // .bitmap and only in the scope. we support this case and enable to export
  const parsedId: BitId = await consumer.scope.getParsedId(id);
  if (parsedId.hasScope()) return parsedId;
  // parsing id from the scope, doesn't provide the scope-name in case it's missing, in this case
  // get the id including the scope from the consumer.
  try {
    return consumer.getParsedId(id);
  } catch (err) {
    // not in the consumer, just return the one parsed without the scope name
    return parsedId;
  }
}

async function linkComponents(ids: BitId[], consumer: Consumer): Promise<void> {
  // we don't have much of a choice here, we have to load all the exported components in order to link them
  // some of the components might be authored, some might be imported.
  // when a component has dists, we need the consumer-component object to retrieve the dists info.
  const components = await Promise.all(ids.map((id) => consumer.loadComponentFromModel(id)));
  const nodeModuleLinker = new NodeModuleLinker(components, consumer, consumer.bitMap);
  await nodeModuleLinker.link();
}

async function ejectExportedComponents(componentsIds): Promise<EjectResults> {
  const consumer: Consumer = await loadConsumer(undefined, true);
  let ejectResults: EjectResults;
  try {
    const ejectComponents = new EjectComponents(consumer, componentsIds);
    ejectResults = await ejectComponents.eject();
  } catch (err) {
    const ejectErr = `The components ${componentsIds.map((c) => c.toString()).join(', ')} were exported successfully.
    However, the eject operation has failed due to an error: ${err.msg || err}`;
    logger.error(ejectErr, err);
    throw new Error(ejectErr);
  }
  // run the consumer.onDestroy() again, to write the changes done by the eject action to .bitmap
  await consumer.onDestroy();
  return ejectResults;
}

async function reImportComponents(consumer: Consumer, ids: BitId[]) {
  await mapSeries(ids, (id) => reImportComponent(consumer, id));
}

async function reImportComponent(consumer: Consumer, id: BitId) {
  const componentWithDependencies = await consumer.loadComponentWithDependenciesFromModel(id);
  const componentMap = consumer.bitMap.getComponent(id);
  const rootDir = componentMap.rootDir;
  const shouldWritePackageJson = async (): Promise<boolean> => {
    if (!rootDir) return false;
    const packageJsonPath = path.join(consumer.getPath(), rootDir, 'package.json');
    return fs.pathExists(packageJsonPath);
  };
  const shouldInstallNpmPackages = (): boolean => {
    return componentMap.origin !== COMPONENT_ORIGINS.AUTHORED;
  };
  const writePackageJson = await shouldWritePackageJson();

  const shouldDependenciesSaveAsComponents = await consumer.shouldDependenciesSavedAsComponents([id]);
  componentWithDependencies.component.dependenciesSavedAsComponents =
    shouldDependenciesSaveAsComponents[0].saveDependenciesAsComponents;

  const manyComponentsWriter = new ManyComponentsWriter({
    consumer,
    componentsWithDependencies: [componentWithDependencies],
    installNpmPackages: shouldInstallNpmPackages(),
    override: true,
    writePackageJson,
  });
  await manyComponentsWriter.writeAll();
}

/**
 * remove the components with the old scope from package.json and from node_modules
 */
async function cleanOldComponents(consumer: Consumer, updatedIds: BitIds, componentsToExport: Component[]) {
  // componentsToExport have the old scope, updatedIds have the new scope, only the old updatedIds
  //  need to be cleaned. that's why we search within componentsToExport for updatedIds
  const componentsToClean = componentsToExport.filter((c) => updatedIds.hasWithoutScopeAndVersion(c.id));
  await packageJsonUtils.removeComponentsFromWorkspacesAndDependencies(consumer, componentsToClean);
}

async function _throwForModified(consumer: Consumer, ids: BitIds) {
  const statuses = await consumer.getManyComponentsStatuses(ids);
  statuses.forEach(({ id, status }) => {
    if (status.modified) {
      throw new GeneralError(
        `unable to perform rewire on "${id.toString()}" because it is modified, please tag or discard your changes before re-trying`
      );
    }
  });
}
