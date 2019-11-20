import R from 'ramda';
import yn from 'yn';
import pMapSeries from 'p-map-series';
import * as path from 'path';
import fs from 'fs-extra';
import { Consumer, loadConsumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import loader from '../../../cli/loader';
import HooksManager from '../../../hooks';
import { BEFORE_EXPORT, BEFORE_EXPORTS, BEFORE_LOADING_COMPONENTS } from '../../../cli/loader/loader-messages';
import { BitId, BitIds } from '../../../bit-id';
import IdExportedAlready from './exceptions/id-exported-already';
import logger from '../../../logger/logger';
import { Analytics } from '../../../analytics/analytics';
import EjectComponents from '../../../consumer/component-ops/eject-components';
import { EjectResults } from '../../../consumer/component-ops/eject-components';
import hasWildcard from '../../../utils/string/has-wildcard';
import { exportMany } from '../../../scope/component-ops/export-scope-components';
import { NodeModuleLinker } from '../../../links';
import BitMap from '../../../consumer/bit-map/bit-map';
import GeneralError from '../../../error/general-error';
import { COMPONENT_ORIGINS, PRE_EXPORT_HOOK, POST_EXPORT_HOOK } from '../../../constants';
import ManyComponentsWriter from '../../../consumer/component-ops/many-components-writer';
import * as packageJsonUtils from '../../../consumer/component/package-json-utils';
import { forkComponentsPrompt } from '../../../prompts';

const HooksManagerInstance = HooksManager.getInstance();

export default (async function exportAction(params: {
  ids: string[];
  remote: string | null | undefined;
  eject: boolean;
  includeDependencies: boolean;
  setCurrentScope: boolean;
  includeNonStaged: boolean;
  codemod: boolean;
  force: boolean;
}) {
  HooksManagerInstance.triggerHook(PRE_EXPORT_HOOK, params);
  const { updatedIds, nonExistOnBitMap, missingScope, exported } = await exportComponents(params);
  let ejectResults;
  if (params.eject) ejectResults = await ejectExportedComponents(updatedIds);
  const exportResults = { componentsIds: exported, nonExistOnBitMap, missingScope, ejectResults };
  HooksManagerInstance.triggerHook(POST_EXPORT_HOOK, exportResults);
  return exportResults;
});

async function exportComponents({
  ids,
  remote,
  includeDependencies,
  setCurrentScope,
  includeNonStaged,
  codemod,
  force
}: {
  ids: string[];
  remote: string | null | undefined;
  includeDependencies: boolean;
  setCurrentScope: boolean;
  includeNonStaged: boolean;
  codemod: boolean;
  force: boolean;
}): Promise<{ updatedIds: BitId[]; nonExistOnBitMap: BitId[]; missingScope: BitId[]; exported: BitId[] }> {
  const consumer: Consumer = await loadConsumer();
  const defaultScope = consumer.config.defaultScope;
  const { idsToExport, missingScope } = await getComponentsToExport(
    ids,
    consumer,
    remote,
    includeNonStaged,
    defaultScope,
    force
  );
  if (R.isEmpty(idsToExport)) return { updatedIds: [], nonExistOnBitMap: [], missingScope, exported: [] };
  if (codemod) _throwForModified(consumer, idsToExport);
  const { exported, updatedLocally } = await exportMany({
    scope: consumer.scope,
    ids: idsToExport,
    remoteName: remote,
    includeDependencies,
    changeLocallyAlthoughRemoteIsDifferent: setCurrentScope,
    codemod,
    defaultScope
  });
  const { updatedIds, nonExistOnBitMap } = _updateIdsOnBitMap(consumer.bitMap, updatedLocally);
  await linkComponents(updatedIds, consumer);
  Analytics.setExtraData('num_components', exported.length);
  if (codemod) {
    await reImportComponents(consumer, updatedIds);
    await cleanOldComponents(consumer, BitIds.fromArray(updatedIds), idsToExport);
  }
  // it is important to have consumer.onDestroy() before running the eject operation, we want the
  // export and eject operations to function independently. we don't want to lose the changes to
  // .bitmap file done by the export action in case the eject action has failed.
  await consumer.onDestroy();
  return { updatedIds, nonExistOnBitMap, missingScope, exported };
}

function _updateIdsOnBitMap(bitMap: BitMap, componentsIds: BitIds): { updatedIds: BitId[]; nonExistOnBitMap: BitIds } {
  const updatedIds = [];
  const nonExistOnBitMap = new BitIds();
  componentsIds.forEach(componentsId => {
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
  defaultScope: string | null | undefined,
  force: boolean
): Promise<{ idsToExport: BitIds; missingScope: BitId[] }> {
  const componentsList = new ComponentsList(consumer);
  const idsHaveWildcard = hasWildcard(ids);
  const filterNonScopeIfNeeded = (bitIds: BitIds): { idsToExport: BitIds; missingScope: BitId[] } => {
    if (remote) return { idsToExport: bitIds, missingScope: [] };
    const [idsToExport, missingScope] = R.partition(id => id.hasScope() || defaultScope, bitIds);
    return { idsToExport: BitIds.fromArray(idsToExport), missingScope };
  };
  const promptForFork = async (bitIds: BitIds | BitId[]) => {
    if (force || !remote) return;
    const idsToFork = bitIds.filter(id => id.scope && id.scope !== remote);
    if (!idsToFork.length) return;
    const forkPromptResult = await forkComponentsPrompt(idsToFork, remote)();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!yn(forkPromptResult.shouldFork)) {
      throw new GeneralError('the operation has been canceled');
    }
  };
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
  const idsToExportP = ids.map(async id => {
    const parsedId = await getParsedId(consumer, id);
    const status = await consumer.getComponentStatusById(parsedId);
    if (status.nested) {
      throw new GeneralError(
        `unable to export "${parsedId.toString()}", the component is not fully available. please use "bit import" first`
      );
    }
    // don't allow to re-export an exported component unless it's being exported to another scope
    if (remote && !status.staged && parsedId.scope === remote) {
      throw new IdExportedAlready(parsedId.toString(), remote);
    }
    return parsedId;
  });
  loader.start(BEFORE_EXPORT); // show single export
  const idsToExport = await Promise.all(idsToExportP);
  await promptForFork(idsToExport);
  return filterNonScopeIfNeeded(BitIds.fromArray(idsToExport));
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
  const components = await Promise.all(ids.map(id => consumer.loadComponentFromModel(id)));
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
    const ejectErr = `The components ${componentsIds.map(c => c.toString()).join(', ')} were exported successfully.
    However, the eject operation has failed due to an error: ${err.msg || err}`;
    logger.error(ejectErr, err);
    throw new Error(ejectErr);
  }
  // run the consumer.onDestroy() again, to write the changes done by the eject action to .bitmap
  await consumer.onDestroy();
  return ejectResults;
}

async function reImportComponents(consumer: Consumer, ids: BitId[]) {
  await pMapSeries(ids, id => reImportComponent(consumer, id));
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
    writeConfig: Boolean(componentMap.configDir), // write bit.json and config files only if it was there before
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    configDir: componentMap.configDir,
    writePackageJson
  });
  await manyComponentsWriter.writeAll();
}

/**
 * remove the components with the old scope from package.json and from node_modules
 */
async function cleanOldComponents(consumer: Consumer, updatedIds: BitIds, idsToExport: BitIds) {
  const idsToClean = idsToExport.filter(id => updatedIds.hasWithoutScopeAndVersion(id));
  await packageJsonUtils.removeComponentsFromWorkspacesAndDependencies(consumer, BitIds.fromArray(idsToClean));
}

async function _throwForModified(consumer: Consumer, ids: BitIds) {
  await pMapSeries(ids, async id => {
    const status = consumer.getComponentStatusById(id);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (status.modified) {
      throw new GeneralError(
        `unable to perform rewire on "${id.toString()}" because it is modified, please tag or discard your changes before re-trying`
      );
    }
  });
}
