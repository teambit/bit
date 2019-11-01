import R from 'ramda';
import { loadConsumer, Consumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import { BitIds } from '../../../bit-id';
import Component from '../../../consumer/component';
import { AutoTagResult } from '../../../scope/component-ops/auto-tag';
import hasWildcard from '../../../utils/string/has-wildcard';
import logger from '../../../logger/logger';
import { Analytics } from '../../../analytics/analytics';
import { MissingDependencies } from '../../../consumer/exceptions';
import ComponentsPendingImport from '../../../consumer/component-ops/exceptions/components-pending-import';
import snapModelComponent from '../../../scope/component-ops/snap-model-component';

export type SnapResults = {
  snappedComponents: Component[];
  autoSnappedResults: AutoTagResult[];
  warnings: string[];
  newComponents: BitIds;
};

export async function snapAction(args: {
  id: string;
  message: string;
  force?: boolean;
  verbose?: boolean;
  ignoreUnresolvedDependencies?: boolean;
  skipTests: boolean;
  skipAutoSnap: boolean;
}): Promise<SnapResults | null> {
  const { id, message, force, verbose, ignoreUnresolvedDependencies, skipTests, skipAutoSnap } = args;
  const consumer: Consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const newComponents = await componentsList.listNewComponents();
  const ids = await getIdsToSnap();
  if (!ids) return null;
  const tagResults = await snap();
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  tagResults.newComponents = newComponents;
  await consumer.onDestroy();
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return tagResults;

  async function getIdsToSnap(): Promise<BitIds> {
    const idHasWildcard = id && hasWildcard(id);
    if (id && !idHasWildcard) {
      const bitId = consumer.getParsedId(id);
      if (!force) {
        const componentStatus = await consumer.getComponentStatusById(bitId);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        if (componentStatus.modified === false) return null;
      }
      return new BitIds(bitId);
    }
    const tagPendingComponents = await componentsList.listCommitPendingComponents();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (R.isEmpty(tagPendingComponents)) return null;
    return idHasWildcard ? ComponentsList.filterComponentsByWildcard(tagPendingComponents, id) : tagPendingComponents;
  }

  async function snap() {
    logger.debug(`snapping the following components: ${ids.toString()}`);
    Analytics.addBreadCrumb('snap', `snapping the following components: ${Analytics.hashData(ids)}`);
    const { components } = await consumer.loadComponents(ids);
    // go through the components list to check if there are missing dependencies
    // if there is at least one we won't snap anything
    if (!ignoreUnresolvedDependencies) {
      const componentsWithMissingDeps = components.filter(component => {
        return Boolean(component.issues);
      });
      if (!R.isEmpty(componentsWithMissingDeps)) throw new MissingDependencies(componentsWithMissingDeps);
    }
    const areComponentsMissingFromScope = components.some(c => !c.componentFromModel && c.id.hasScope());
    if (areComponentsMissingFromScope) {
      throw new ComponentsPendingImport();
    }

    const { taggedComponents, autoTaggedResults } = await snapModelComponent({
      consumerComponents: components,
      scope: consumer.scope,
      message,
      force,
      consumer,
      skipTests,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      verbose,
      skipAutoSnap
    });

    const autoTaggedComponents = autoTaggedResults.map(r => r.component);
    const allComponents = [...taggedComponents, ...autoTaggedComponents];
    await consumer.updateComponentsVersions(allComponents);

    return { snappedComponents: taggedComponents, autoSnappedResults: autoTaggedResults };
  }
}
