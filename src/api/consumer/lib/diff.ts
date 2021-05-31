import { BitId } from '../../../bit-id';
import { Consumer, loadConsumer } from '../../../consumer';
import componentsDiff from '../../../consumer/component-ops/components-diff';
import ComponentsList from '../../../consumer/component/components-list';
import GeneralError from '../../../error/general-error';
import hasWildcard from '../../../utils/string/has-wildcard';

export default async function diff(values: string[], verbose: boolean, table: boolean): Promise<any> {
  const consumer: Consumer = await loadConsumer();
  const { bitIds, version, toVersion } = await parseValues(consumer, values);
  if (!bitIds || !bitIds.length) {
    throw new GeneralError('there are no modified components to diff');
  }
  const diffResults = await componentsDiff(consumer, bitIds, version, toVersion, verbose, table);
  await consumer.onDestroy();
  return diffResults;
}

async function parseValues(
  consumer: Consumer,
  values: string[]
): Promise<{ bitIds: BitId[]; version?: string; toVersion?: string }> {
  // option #1: bit diff
  // no arguments
  if (!values.length) {
    const componentsList = new ComponentsList(consumer);
    const bitIds = await componentsList.listModifiedComponents();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return { bitIds };
  }
  const firstValue = values[0];
  const lastValue = values[values.length - 1];
  const oneBeforeLastValue = values[values.length - 2];
  const isLastItemVersion = BitId.isValidVersion(lastValue);
  const isOneBeforeLastItemVersion = BitId.isValidVersion(oneBeforeLastValue);
  // option #2: bit diff [ids...]
  // all arguments are ids
  if (!isLastItemVersion) {
    return { bitIds: getBitIdsForDiff(consumer, values) };
  }
  // option #3: bit diff [id] [version]
  // last argument is a version, first argument is id
  if (!isOneBeforeLastItemVersion) {
    if (values.length !== 2) {
      throw new GeneralError(
        `bit diff [id] [version] syntax was used, however, ${values.length} arguments were given instead of 2`
      );
    }
    return { bitIds: getBitIdsForDiff(consumer, [firstValue]), version: lastValue };
  }
  // option #4: bit diff [id] [version] [to_version]
  // last argument and one before the last are versions, first argument is id
  if (values.length !== 3) {
    throw new GeneralError(
      `bit diff [id] [version] [to_version] syntax was used, however, ${values.length} arguments were given instead of 3`
    );
  }
  return { bitIds: getBitIdsForDiff(consumer, [firstValue]), version: oneBeforeLastValue, toVersion: lastValue };
}

function getBitIdsForDiff(consumer: Consumer, ids: string[]): BitId[] {
  if (hasWildcard(ids)) {
    const componentsList = new ComponentsList(consumer);
    return componentsList.listComponentsByIdsWithWildcard(ids);
  }
  return ids.map((id) => consumer.getParsedId(id));
}
