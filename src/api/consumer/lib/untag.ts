import { Consumer, loadConsumer } from '../../../consumer';
import {
  removeLocalVersion,
  removeLocalVersionsForAllComponents,
  removeLocalVersionsForComponentsMatchedByWildcard,
  untagResult,
} from '../../../scope/component-ops/untag-component';
import hasWildcard from '../../../utils/string/has-wildcard';
import ComponentsList from '../../../consumer/component/components-list';
import { BitId } from '../../../bit-id';
import Component from '../../../scope/models/model-component';

export default async function unTagAction(
  version: string | undefined,
  force: boolean,
  soft: boolean,
  id?: string
): Promise<{ results: untagResult[]; isSoftUntag: boolean }> {
  const consumer: Consumer = await loadConsumer();
  const idHasWildcard = hasWildcard(id);
  const untag = async (): Promise<untagResult[]> => {
    if (idHasWildcard) {
      return removeLocalVersionsForComponentsMatchedByWildcard(consumer.scope, version, force, id);
    }
    if (id) {
      const bitId = consumer.getParsedId(id);
      // a user might run the command `bit untag id@version` instead of `bit untag id version`
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (bitId.hasVersion() && !version) version = bitId.version;
      const result = await removeLocalVersion(consumer.scope, bitId, version, force);
      return [result];
    }
    // untag all
    return removeLocalVersionsForAllComponents(consumer.scope, version, force);
  };
  const softUntag = () => {
    const getIds = (): BitId[] => {
      const componentsList = new ComponentsList(consumer);
      const softTaggedComponents = componentsList.listSoftTaggedComponents();
      if (idHasWildcard) {
        return componentsList.listComponentsByIdsWithWildcard([id as string]);
      }
      if (id) {
        return [consumer.getParsedId(id)];
      }
      return softTaggedComponents;
    };
    const idsToRemoveSoftTags = getIds();
    return idsToRemoveSoftTags
      .map((bitId) => {
        const componentMap = consumer.bitMap.getComponent(bitId, { ignoreScopeAndVersion: true });
        const removedVersion = componentMap.nextVersion?.version;
        if (!removedVersion) return null;
        componentMap.clearNextVersion();
        return { id: bitId, versions: [removedVersion] };
      })
      .filter((x) => x);
  };
  let results: untagResult[];
  const isRealUntag = !soft;
  if (isRealUntag) {
    results = await untag();
    await consumer.scope.objects.persist();
    const components = results.map((result) => result.component);
    await consumer.updateComponentsVersions(components as Component[]);
  } else {
    // @ts-ignore null was filtered before.
    results = softUntag();
    consumer.bitMap.markAsChanged();
  }

  await consumer.onDestroy();
  return { results, isSoftUntag: !isRealUntag };
}
