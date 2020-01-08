import R from 'ramda';
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import CapsuleBuilder, { Options } from '../../../environment/capsule-builder';
import { CapsuleOptions } from '../../../orchestrator/types';
import BitCapsule from '../../../capsule-ext/bit-capsule';

export default (async function capsuleIsolate(
  bitIds: BitId[] | string[],
  capsuleOptions: CapsuleOptions,
  options: Options
): Promise<{ [bitId: string]: BitCapsule }> {
  const consumer = await loadConsumer();
  const bitIdFormat = R.map(bitId => (bitId instanceof BitId ? bitId : consumer.getParsedId(bitId)), bitIds);
  const capsuleBuilder = new CapsuleBuilder(consumer.getPath());
  return capsuleBuilder.isolateComponents(consumer, bitIdFormat, capsuleOptions, options);
});
