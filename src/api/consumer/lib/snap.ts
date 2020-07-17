import R from 'ramda';
import { loadConsumer, Consumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import { BitIds } from '../../../bit-id';
import Component from '../../../consumer/component';
import { AutoTagResult } from '../../../scope/component-ops/auto-tag';
import hasWildcard from '../../../utils/string/has-wildcard';

export type SnapResults = {
  snappedComponents: Component[];
  autoSnappedResults: AutoTagResult[];
  warnings: string[];
  newComponents: BitIds;
};

export async function snapAction(args: {
  id: string;
  message: string;
  force: boolean;
  verbose: boolean;
  ignoreUnresolvedDependencies: boolean;
  skipTests: boolean;
  skipAutoSnap: boolean;
}): Promise<SnapResults | null> {
  const { id, message, force, verbose, ignoreUnresolvedDependencies, skipTests, skipAutoSnap } = args;
  const consumer: Consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const newComponents = await componentsList.listNewComponents();
  const ids = await getIdsToSnap();
  if (!ids) return null;
  const tagResults = await consumer.snap({
    ids,
    ignoreUnresolvedDependencies,
    message,
    force,
    skipTests,
    verbose,
    skipAutoSnap,
  });
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
}
