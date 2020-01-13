import { loadConsumerIfExist } from '../../../consumer';
import CapsuleBuilder, { Options } from '../../../environment/capsule-builder';
import { CapsuleOptions } from '../../../orchestrator/types';
import BitCapsule from '../../../capsule/bit-capsule';

export default (async function capsuleIsolate(
  bitIds: string[],
  capsuleOptions: CapsuleOptions,
  options: Options
): Promise<{ [bitId: string]: BitCapsule }> {
  const consumer = await loadConsumerIfExist();
  if (!consumer) throw new Error('no consumer found');
  const capsuleBuilder = new CapsuleBuilder(consumer.getPath());
  return capsuleBuilder.isolateComponents(bitIds, capsuleOptions, options, consumer);
});
