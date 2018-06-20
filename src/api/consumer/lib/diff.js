// @flow
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import ComponentsList from '../../../consumer/component/components-list';
import GeneralError from '../../../error/general-error';
import componentsDiff from '../../../consumer/component-ops/components-diff';

export default (async function diff(values: string[]): Promise<any> {
  const consumer: Consumer = await loadConsumer();
  const { bitIds, version, toVersion } = await parseValues(consumer, values);
  if (!bitIds || !bitIds.length) {
    throw new GeneralError('there are no modified components to diff');
  }
  const diffResults = await componentsDiff(consumer, bitIds, version, toVersion);
  await consumer.onDestroy();
  return diffResults;
});

async function parseValues(
  consumer: Consumer,
  values: string[]
): Promise<{ bitIds: BitId[], version?: string, toVersion?: string }> {
  // option #1: bit diff
  // no arguments
  if (!values.length) {
    const componentsList = new ComponentsList(consumer);
    const bitIds = await componentsList.listModifiedComponents();
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
    return { bitIds: values.map(id => BitId.parse(id)) };
  }
  // option #3: bit diff [id] [version]
  // last argument is a version, first argument is id
  if (!isOneBeforeLastItemVersion) {
    if (values.length !== 2) {
      throw new GeneralError(
        `bit diff [id] [version] syntax was used, however, ${values.length} arguments were given instead of 2`
      );
    }
    return { bitIds: [BitId.parse(firstValue)], version: lastValue };
  }
  // option #4: bit diff [id] [version] [to_version]
  // last argument and one before the last are versions, first argument is id
  if (values.length !== 3) {
    throw new GeneralError(
      `bit diff [id] [version] [to_version] syntax was used, however, ${
        values.length
      } arguments were given instead of 3`
    );
  }
  return { bitIds: [BitId.parse(firstValue)], version: oneBeforeLastValue, toVersion: lastValue };
}
